var Discord = require('discord.js');
var auth = require('./auth.json');
var msgCache = [];

const client = new Discord.Client();

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
					var msgCapacity = 10;
				}

				//Creates new message object.
				const newMsg = await msg.channel.send(`> **Event Name**: *${msgName}*\n> **Event Time**: *${msgTime}*\n> **Capacity**: *0/${msgCapacity}*\n> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`);
				msg.delete();
				msgCache.push({
					message_id: newMsg.id,
					msgObj: newMsg,
					name: msgName,
					time: msgTime,
					capacity: msgCapacity,
					roster: []
				});
				//Reaction commands to interact with scheduled event.
				await newMsg.react("✅"); await newMsg.react("❌");
				break;

		}

	}
});

client.on("raw", async packet => {
	if (packet.t === "MESSAGE_REACTION_ADD" && packet.d.user_id !== auth.user_id) {
		try {
			console.log(`User_id ${packet.d.user_id} reacted with ${packet.d.emoji.name} to message ${packet.d.message_id}.`);

			//Validate that reacted message is within cached messages.
			let cachedMsg = false;
			for (element of msgCache) {
				if (element.message_id === packet.d.message_id) {
					cachedMsg = element;
					break;
				}
			}



			if (cachedMsg) {

				cachedMsg.msgObj.reactions.forEach(reaction => reaction.remove(packet.d.user_id));

				let bool = false;
				
				for (member of cachedMsg.roster) {
					if (packet.d.user_id === member.user_id) {
						bool = true;
					}
				}
				

				if (! bool && packet.d.emoji.name === "✅" && cachedMsg.capacity > cachedMsg.roster.length) {

					client.fetchUser(packet.d.user_id)
					.then(user => {
						cachedMsg.roster.push({
							user_id: user.id,
							username: user.username
						});
						return cachedMsg.roster;
					})
					.then(roster => {
						var rosterString = roster.reduce((rosterString, member) => {
							return rosterString + `> *${member.username}*\n`;
						}, "");
						cachedMsg.msgObj.edit(
							`> **Event Name:**  *${cachedMsg.name}*\n` +
							`> **Event Time:**  *${cachedMsg.time}*\n` +
							`> **Capacity:** *${cachedMsg.roster.length}/${cachedMsg.capacity}*\n` +
							`> \n${rosterString}` +
							`> \n> *Please be gentle with me. I am hosted on a potato.*\n> *React with :white_check_mark: to join.*`
							);
					})
					.catch(error =>
						console.error(error)
					);

				}
			}
		}
		catch (error) {
			console.error(error);
		}
		
	}
});


client.login(auth.token);