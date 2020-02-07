var Discord = require("discord.js");
var auth = require("./auth.json");
var mysql = require("mysql")

var client = new Discord.Client();

//Wrapper class for MySQL client.
class Database {

	constructor(auth) {
		 this.connection = mysql.createConnection({
			host: auth.db_host,
			user: auth.db_user,
			password: auth.db_pw,
			database: auth.db_name
		});

		//Database connect.
		this.connection.connect(function (error) {
			if (error) {
				throw error;
			}
			console.log("Database connected.");

			//Discord Bot Client connect.
			client.login(auth.token)
			.catch(console.error);
		});
	} //End constructor.

	//Query function.
	query(sql, args) {
		return new Promise( (resolve, reject) => {
			this.connection.query(sql, args, (error, result) => {
				if (error) return reject(error);
				resolve(result);
			});
		});
	}
}

const database = new Database(auth);

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
				await newMsg.react("✅"); await newMsg.react("❌"); await newMsg.react("🚫");

				//Create table for new event.
				database.query(`CREATE TABLE message_${newMsg.id} (user_id VARCHAR(20) NOT NULL PRIMARY KEY, username TINYTEXT NOT NULL);`)
				.then(() => {
					//Create record for event message info.
					return database.query(`INSERT INTO messages (channel_id, message_id, message_name, message_time, capacity) VALUES ('${newMsg.channel.id}', '${newMsg.id}', '${msgName}', '${msgTime}', '${msgCapacity}');`);
				})
				.then(() => {
					console.log(`${newMsg.id}: New Event Created, "${msgName}"`);
				})
				.catch(console.error)

				break;

			case "info":
			case "help":
				msg.channel.send("Use **NewEvent** to schedule a new event!\n"
					+ "```e!newevent [Event Name (default: No Name Given)], [Event Time (default: No Time Given)], [Maximum Capacity (default: 10)]\n"
					+ "Example: \ne!newevent Example Gathering, Friday 16:00, 15```\n"
					+ "Users react with :white_check_mark: and :x: to join and leave events.\n"
					+ ":no_entry_sign: deletes the event (permissions required)."
					);
				break;
		}

	}
});

client.on("raw", async packet => {
	if (packet.t === "MESSAGE_REACTION_ADD" && packet.d.user_id !== auth.user_id) {
		let message_info;
		database.query(`SELECT * FROM messages where message_id = '${packet.d.message_id}';`)
		.then(rows => {
			if (rows.length <= 1)  {
				//Message exists in database.
				message_info = rows[0];
				const databasePromise = database.query(`SELECT * FROM message_${packet.d.message_id};`);
				const userPromise = client.fetchUser(packet.d.user_id);
				const messagePromise = client.channels.get(message_info.channel_id).fetchMessage(message_info.message_id);

				Promise.all([databasePromise, userPromise, messagePromise]).then(values => {
					const eventRoster = values[0];
					const userObj = values[1];
					const messageObj = values[2];

					//Removes the added reaction.
					messageObj.reactions.forEach(reaction => reaction.remove(packet.d.user_id));

					switch (packet.d.emoji.name) {
						case "✅": //Adds member to event roster.
							if (eventRoster.length < message_info.capacity && eventRoster.reduce((memberObj, member) => member.user_id === packet.d.user_id ? member : memberObj, null) === null) {
								database.query(`INSERT INTO message_${message_info.message_id} (user_id, username) VALUES ('${userObj.id}','${userObj.username}');`);

								//Converts event roster to string.
								var rosterString = eventRoster.reduce((rosterString, member) =>  rosterString + `> *${member.username}*\n`, "");
								rosterString += `> *${userObj.username}*\n`;

								//Updates message.
								messageObj.edit(`> **Event Name:**  *${message_info.message_name}*\n` +
										`> **Event Time:**  *${message_info.message_time}*\n` +
										`> **Capacity:** *${eventRoster.length + 1}/${message_info.capacity}*\n` +
										`> \n${rosterString}` +
										`> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`);
							}
						break;
					case "❌": //Removes member from event roster.
						var indexDelete;
						if ((indexDlete = eventRoster.reduce((memberIndex, member, index) => member.user_id === packet.d.user_id ? index : memberIndex, null)) !== null) {
							//Deletes record from message table.
							database.query(`DELETE FROM message_${message_info.message_id} WHERE user_id = '${userObj.id}'`);

							//Removes user object from array.
							eventRoster.splice(indexDelete, 1);

							//Converts event roster to string.
							var rosterString = eventRoster.reduce((rosterString, member) =>  rosterString + `> *${member.username}*\n`, "");

							//Updates message.
							messageObj.edit(`> **Event Name:**  *${message_info.message_name}*\n` +
										`> **Event Time:**  *${message_info.message_time}*\n` +
										`> **Capacity:** *${eventRoster.length + 1}/${message_info.capacity}*\n` +
										`> \n${rosterString}` +
										`> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`);
						}
						break;
					case "🚫": //Removes event. Checks for permissions.
						//User can manage messages.
						if (messageObj.channel.permissionsFor(userObj).has("MANAGE_MESSAGES", false)) {
							database.query(`DROP TABLE message_${message_info.message_id}`);
							database.query(`DELETE FROM messages WHERE message_id = ${message_info.message_id}`);
							messageObj.delete()
							.then(msg => console.log(`${message_info.message_id}: Event deleted.`));
						}
						break;
				} //End switch statement.
			});
		}
		})
		.catch(console.error);
	}
});

/*
client.on("raw", async packet => {
	if (packet.t === "MESSAGE_REACTION_ADD" && packet.d.user_id !== auth.user_id) {
		try {

				let message_info, message_roster, user_infom, eventRoster;
				database.query(`SELECT * FROM messages where message_id = '${packet.d.message_id}';`)
				.then((message_record) => {
					if (message_record.length !== 0) {
						message_info = message_record[0];
						return packet.d.emoji.name;
					}
					return new Error(`${packet.d.message_id}: Message not recorded.`)
				})
				.then((emoji) => {
					switch (emoji) {
						case "✅":
						console.log(message_info);
							database.query(`SELECT * FROM message_${message_info.message_id}`)
							.then(rows => {
								eventRoster = rows;
								if (eventRoster.length < message_info.capacity) {
									let rosterMember = eventRoster.reduce((memberObj, member) => member.user_id === packet.d.user_id ? member : memberObj, null);
									if (rosterMember === null) {
										message_roster = eventRoster;
										return client.fetchUser(packet.d.user_id);
									}
								}
								throw new Error(`${packet.d.message_id}: Failed to add new member to roster.`);
							})
							.then(user => {
								user_info = {id: user.id, username: user.username};
								return database.query(`INSERT INTO message_${message_info.message_id} (user_id, username) VALUES ('${user.id}','${user.username}');`);
							})
							.then(result => {
								return client.channels.get(message_info.channel_id).fetchMessage(message_info.message_id);
							})
							.then(msg => {
								msg.reactions.forEach(reaction => reaction.remove(packet.d.user_id));
								var rosterString = message_roster.reduce((rosterString, member) =>  rosterString + `> *${member.username}*\n`, "");
								rosterString += `> *${user_info.username}*\n`;

								msg.edit(`> **Event Name:**  *${message_info.message_name}*\n` +
										`> **Event Time:**  *${message_info.message_time}*\n` +
										`> **Capacity:** *${eventRoster.length + 1}/${message_info.capacity}*\n` +
										`> \n${rosterString}` +
										`> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`);
							})
							.catch();
						break;
					}
				})
				.catch();

		}
		catch (error) {
		}
		
	}
});
*/