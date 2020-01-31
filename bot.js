var Discord = require('discord.js');
var auth = require('./auth.json');
var eventMessages = [];

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
					var eventName = (/S+/.test(args[0].trim()) ? args[0].trim() : "No Name Given");
				}
				catch (error) {
					//console.error(error);
					var eventName = "No Name Given";
				}

				try {
					var eventTime = args[1].trim();
				}
				catch (error) {
					//console.error(error);
					var eventTime = "No Time Given";
				}
				try {
					var eventSlots = (/^\d+$/.test(args[2].trim()) ? args[2].trim() : 10);
				} catch (error) {
					//console.error(error);
					var eventSlots = 10;
				}


				const newEvent = await msg.channel.send(`> Event Name: ${eventName}\n> Event Time: ${eventTime}\n> Slots Taken: 0/${eventSlots}`);
				eventMessages.push(newEvent);

		}

	}
});

client.on("raw", packet => {
	if (packet.t === "MESSAGE_REACTION_ADD") {
		console.log("Reaction added");
	}
});

client.login(auth.token);