//TODO: CHECK MESSAGE CACHE BEFORE FETCH.
const Discord = require("discord.js");

class Handler {

	//Constructor.
	constructor(database, client) {
		this.database = database;
		this.client = client;
		console.log("Handler constructed.");
	}

	async onReaction(packet) { //Reaction handler function.
		this.database.query(`SELECT * FROM messages where message_id = '${packet.d.message_id}';`)
		.then(rows => {
			if (rows.length <= 1)  {

				//Promises.
				const databasePromise = this.database.query(`SELECT * FROM message_${packet.d.message_id};`);
				const userPromise = this.client.fetchUser(packet.d.user_id);
				const messagePromise = this.client.channels.get(rows[0].channel_id).fetchMessage(rows[0].message_id);

				Promise.all([databasePromise, userPromise, messagePromise]).then(promiseValues => {
					//Removes reactions.
					promiseValues[2].reactions.forEach(reaction => reaction.remove(packet.d.user_id));

					//Creates args object.
					const args = {
						eventRoster: promiseValues[0],
						userObj: promiseValues[1],
						messageObj: promiseValues[2],
						message_info: rows[0],
						packet: packet
					}

					switch (packet.d.emoji.name) {
						case "✅": //Adds member to event roster.
							this.addMember(args);
							break;
						case "❌": //Removes member from event roster.
							this.removeMember(args);
							break;
						case "🚫": //Removes event. Checks for permissions.
							this.deleteEvent(args);
							break;
					} //End switch statement.

				});
			} //End if.
		})
		.catch(console.error);
	} //End onReaction function.

	addMember(args) {
		if (args.eventRoster.length < args.message_info.message_capacity && args.eventRoster.reduce((memberObj, member) => member.user_id === args.packet.d.user_id ? member : memberObj, null) === null) {
			//Creates record of user.
			this.database.query(`INSERT INTO message_${args.message_info.message_id} (user_id, username) VALUES ('${args.userObj.id}','${args.userObj.username}');`);

			if (args.message_info.rich) {
				//Reduce to array.
				let eventRoster = [];
				args.eventRoster.forEach(member => {
					eventRoster.push(member.userName);
				});
				eventRoster.push(args.userObj.username);

				//Args for the Rich Embed object.
				const embedArgs = {
					title: args.message_info.message_name,
					author: args.message_info.message_author,
					description: args.message_info.message_description,
					time: args.message_info.message_time,
					capacity: args.message_info.message_capacity,
					members: eventRoster
				}
				//embedArgs => embedObj.
				const embedObj = this.getRichEmbedObj(embedArgs);

				//Edits rich embed message.
				args.messageObj.edit(new Discord.RichEmbed(embedObj));
			} else {
				//Converts event roster to string.
				let rosterString = args.eventRoster.reduce((rosterString, member) =>  rosterString + `> *${member.username}*\n`, "");
				rosterString += `> *${args.userObj.username}*\n`;

				//Updates message.
				args.messageObj.edit(`@here \n> **Event Name:**  *${args.message_info.message_name}*\n` +
						`> **Event Time:**  *${args.message_info.message_time}*\n` +
						`> **Capacity:** *${args.eventRoster.length + 1}/${args.message_info.message_capacity}*\n` +
						`> \n${rosterString}` +
						`> \n> *React with :white_check_mark: to join.*`);
			}
		} //End if.
	} //End addMember function.

	removeMember(args) {
		let indexDelete;
		if ((indexDelete = args.eventRoster.reduce((memberIndex, member, index) => member.user_id === args.packet.d.user_id ? index : memberIndex, null)) !== null) {
			//Deletes record from message table.
			this.database.query(`DELETE FROM message_${args.message_info.message_id} WHERE user_id = '${args.userObj.id}'`);

			//Removes user object from array.
			args.eventRoster.splice(indexDelete, 1);
			if (args.message_info.rich) {
				//Converts args.eventRoster to array of usernames.
				let eventRoster = [];
				args.eventRoster.forEach(member => {
					eventRoster.push(member.username);
				});

				//Args for the Rich Embed object.
				const embedArgs = {
					title: args.message_info.message_name,
					author: args.message_info.message_author,
					description: args.message_info.message_description,
					time: args.message_info.message_time,
					capacity: args.message_info.message_capacity,
					members: eventRoster
				}
				//embedArgs => embedObj.
				const embedObj = this.getRichEmbedObj(embedArgs);

				//Edits rich embed message.
				args.messageObj.edit(new Discord.RichEmbed(embedObj));
			} else {
				//Converts event roster to string.
				const rosterString = args.eventRoster.reduce((rosterString, member) =>  rosterString + `> *${member.username}*\n`, "");

				//Updates message.
				args.messageObj.edit(`@here \n> **Event Name:**  *${args.message_info.message_name}*\n` +
							`> **Event Time:**  *${args.message_info.message_time}*\n` +
							`> **Capacity:** *${args.eventRoster.length}/${args.message_info.message_capacity}*\n` +
							`> \n${rosterString}` +
							`> \n> *React with :white_check_mark: to join.*`);
			}
		} //End if.
	} //End removeMember function.
	
	deleteEvent(args) {
		//User can manage messages.
		if (args.messageObj.channel.permissionsFor(args.userObj).has("MANAGE_MESSAGES", false)) {
			this.database.query(`DROP TABLE message_${args.message_info.message_id}`);
			this.database.query(`DELETE FROM messages WHERE message_id = ${args.message_info.message_id}`);
			args.messageObj.delete()
			.then(msg => console.log(`${args.message_info.message_id}: Event deleted.`))
			.catch(console.error);
		}
	} //End deleteEvent function.

	async onCommand(packet) {
		let command = packet.d.content.substring(2).split(" ");
		//Validate command isn't an empty string.
		if (command.length === 0 || (command = command[0].trim().toLowerCase()) === "") {
			return;
		}
		switch (command) {
			case "info":
			case "help":
				this.commandHelp(packet); //Displays help info.
				break;
			case "newevent":
				this.commandNew(packet); //Create new event message.
				break;
			case "richevent":
				this.commandRich(packet);
				break;
		}

	}

	async commandNew(packet) { //Create new event.
		let args = packet.d.content.substring(11).split(",");
		//Parse args.
		args = this.getArgsNewEvent(...args);

		const channel = this.client.channels.get(packet.d.channel_id);

		//Send new event message.
		const newMessage = await channel.send(`@here \n> **Event Name**: *${args[0]}*\n> **Event Time**: *${args[1]}*\n> **Capacity**: *0/${args[2]}*\n> \n> *React with :white_check_mark: to join.*`);
		newMessage.pin();
		await newMessage.react("✅"); await newMessage.react("❌"); await newMessage.react("🚫");

		//Deletes command message.
		channel.fetchMessage(packet.d.id).then(message => message.delete());

		//Create table for new event.
		this.database.query(`CREATE TABLE message_${newMessage.id} (user_id VARCHAR(20) NOT NULL PRIMARY KEY, username TINYTEXT NOT NULL);`)
		.then(() => {
			//Create record for event message info.
			return this.database.query(`INSERT INTO messages (channel_id, message_id, rich, message_name, message_time, message_capacity) VALUES ('${channel.id}', '${newMessage.id}', '0', '${args[0]}', '${args[1]}', '${args[2]}');`);
		})
		.then(() => {
			console.log(`${newMessage.id}: New Event Created, "${args[0]}"`);
		})
		.catch(console.error);
		return;
	} //End commandNew function.

	getArgsNewEvent(name = "No Name Given", time = "No Time Given", capacity = "10") {
		name = name.trim() === "" ? "No Name Given" : name.trim();
		time = time.trim() === "" ? "No Time Given" : time.trim();
		capacity = /^\d+$/.test(capacity.trim()) ? capacity.trim() : 10;
		return [name, time, capacity];
	} //end getArgsNewEvent function.

	async commandRich(packet) {

		let args = packet.d.content.substring(12).split(",");

		args = this.getArgsRichEvent(...args);

		const channel = this.client.channels.get(packet.d.channel_id);

		const embArgs = {
			title: args[0],
			author: packet.d.author.username,
			description: args[3],
			time: args[1],
			capacity: args[2],
			members: []
		}

		const embedObj = this.getRichEmbedObj(embArgs);

		const newMessage = await channel.send(new Discord.RichEmbed(embedObj));
		newMessage.pin();
		await newMessage.react("✅"); await newMessage.react("❌"); await newMessage.react("🚫");

		//Deletes command message.
		channel.fetchMessage(packet.d.id).then(message => message.delete());

		//Create table for new event.
		this.database.query(`CREATE TABLE message_${newMessage.id} (user_id VARCHAR(20) NOT NULL PRIMARY KEY, username TINYTEXT NOT NULL);`)
		.then(() => {
			//Create record for event message info.
			return this.database.query(`INSERT INTO messages (channel_id, message_id, rich, message_name, message_time, message_capacity, message_description, message_author) VALUES ('${channel.id}', '${newMessage.id}', '1', '${args[0]}', '${args[1]}', '${args[2]}', '${args[3]}', '${packet.d.author.username}');`);
		})
		.then(() => {
			console.log(`${newMessage.id}: New Rich Event Created, "${args[0]}"`);
		})
		.catch(console.error);
		return;
	} //end commandRich function.

	getArgsRichEvent(name = "No Name Given", time = "No Time Given", capacity = "10", ...descriptionArray) {
		let description = "" + descriptionArray.join(",");
		name = name.trim() === "" ? "No Name Given" : name.trim();
		time = time.trim() === "" ? "No Time Given" : time.trim();
		capacity = /^\d+$/.test(capacity.trim()) ? capacity.trim() : 10;
		return [name, time, capacity, description];
	}

	getRichEmbedObj(args) {

		const embedObj = {

			color: 0x0099ff,
			title: args.title,
			author: {
				name: "Host: " + args.author
			},
			description: args.description,
			fields: [
				{
					name: "Time",
					value: args.time,
					inline: true
				},
				{
					name: "Capacity",
					value: args.capacity,
					inline: true
				},
				{
					name: "Members",
					value: "*empty*"
				}
			],
			timestamp: new Date()

		} //End embedObj.
		if (args.members.length > 0) {
			embedObj.fields[2].value = "";
			args.members.forEach(member => {
				embedObj.fields[2].value += `${member}\n`;
			});
		}

		return embedObj;

	}

	async commandHelp(packet) {
		this.client.channels.get(packet.d.channel_id).send(
			"Use **NewEvent** to schedule a new event!\n"
			+ "```e!newevent [Event Name (default: No Name Given)], [Event Time (default: No Time Given)], [Maximum Capacity (default: 10)]\n"
			+ "Example: \ne!newevent Example Gathering, Friday 16:00, 15```\n"
			+ "Users react with :white_check_mark: and :x: to join and leave events.\n"
			+ ":no_entry_sign: deletes the event (permissions required)."
			);
		return;
	} //End commandHelp function.



}

module.exports = Handler;