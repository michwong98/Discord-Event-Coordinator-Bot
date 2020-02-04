var Discord = require("discord.js");
var auth = require("./auth.json");
var mysql = require("mysql")

var client = new Discord.Client();

client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
	});

client.on('message', async msg => {
	if (msg.content.substring(0, 2) == "e!") {
		var cmd = msg.content.substring(2).split(" ")[0].toLowerCase();
		var x = msg.content.indexOf(" ");
		var args = (x === -1 ? "" : msg.content.substring(x + 1));
		switch (cmd) {
			case "newevent":
				args = args.split(",");

				try {
					//Validates input.
					var msgName = (/\S+/.test(args[0].trim()) ? args[0].trim() : "No Name Given");
				}
				catch (error) {
					//Default name for scheduled event.
					var msgName = "No Name Given";
				}

				try {
					var msgTime = args[1].trim();
				}
				catch (error) {
					//Default value for scheduled time.
					var msgTime = "No Time Given";
				}
				try {
					//Validates unsigned number.
					var msgCapacity = (/^\d+$/.test(args[2].trim()) ? args[2].trim() : 10);
				} catch (error) {
					//Default value of 10 for maximum capacity.
					//TODO: Default no capacity.
					var msgCapacity = 10;
				}

				const newMsg = await msg.channel.send(`> **Event Name**: *${msgName}*\n> **Event Time**: *${msgTime}*\n> **Capacity**: *0/${msgCapacity}*\n> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`);
				msg.delete();
				//Reaction commands to interact with scheduled event.
				await newMsg.react("✅"); await newMsg.react("❌");

				//Creates table to save event members.
				db.query(`CREATE TABLE message_${newMsg.id} (user_id VARCHAR(20), username TINYTEXT);`, function(error, result) {
					if (error) {
						throw error;
					}

					//Creates new message object.

					//Record for new event message.
					db.query(`INSERT INTO messages (channel_id, message_id, message_name, message_time, capacity) VALUES ('${newMsg.channel.id}', '${newMsg.id}', '${msgName}', '${msgTime}', '${msgCapacity}');`, function(error, result) {
						if (error) {
							throw error;
						}
						console.log(`${newMsg.id}, New Event Created: ${msgName}`);
					});

				});

				break;

			case "info":
			case "help":
				msg.channel.send("Use **NewEvent** to schedule a new event!\n```e!newevent [Event Name (default: No Name Given)], [Event Time (default: No Time Given)], [Maximum Capacity (default: 10)]```");
				break;
		}

	}
});

client.on("raw", async packet => {
	if (packet.t === "MESSAGE_REACTION_ADD" && packet.d.user_id !== auth.user_id) {
		try {

			db.query(`SELECT * FROM messages WHERE message_id = '${packet.d.message_id}';`, function (error, messages) {
				if (error) {
					throw error;
				}

				if (messages.length !== 0) {
					
					var message_info = messages[0];

					client.channels.get(message_info.channel_id).fetchMessage(message_info.message_id)
					.then(msg => {
						//Removes added reaction.
						msg.reactions.forEach(reaction => reaction.remove(packet.d.user_id));

						if (packet.d.emoji.name === "✅" || packet.d.emoji.name === "❌") {
							db.query(`SELECT * FROM message_${message_info.message_id};`, function (error, eventRoster) {

								if (error) throw error;

								switch (packet.d.emoji.name) {

									case "✅":

										//Check capacity.
										if (eventRoster.length < message_info.capacity) {

											//Is the user a member of the event roster?
											let memberObj = eventRoster.reduce((memberObj, member) => member.user_id === packet.d.user_id ? member : memberObj, null);

											//User is not a member of the event roster.
											if (memberObj === null) {
												client.fetchUser(packet.d.user_id)
												.then(user => {

													//Insert new member into event roster.
													db.query(`INSERT INTO message_${message_info.message_id} (user_id, username) VALUES ('${user.id}','${user.username}');`, function(error, result) {
														if (error) throw error;

														//Update message.
														var rosterString = eventRoster.reduce((rosterString, member) =>  rosterString + `> *${member.username}*\n`, "");
														rosterString += `> *${user.username}*\n`;

														msg.edit(`> **Event Name:**  *${message_info.message_name}*\n` +
															`> **Event Time:**  *${message_info.message_time}*\n` +
															`> **Capacity:** *${eventRoster.length + 1}/${message_info.capacity}*\n` +
															`> \n${rosterString}` +
															`> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`);
													});

												});

											} //End if memberObj.

										} //End if capacity.

										break;

								} //End switch statement.
								
							});

						}

					});

				} //End message.length if.

			});

		}
		catch (error) {
			console.error(error);
		}
		
	}
});

var db = mysql.createConnection({
	host: auth.db_host,
	user: auth.db_user,
	password: auth.db_pw,
	database: auth.db_name
});

//Database connect.
db.connect(function (error) {
	if (error) {
		throw error;
	}
	console.log("Database connected.");

	//Discord Bot Client connect.
	client.login(auth.token)
	.catch(console.error);
});