const Discord = require("discord.js");
const auth = require("./auth.json");
const mysql = require("mysql")
const Handler = require("./handler.js");

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

const handler = new Handler(database, client);

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
				newMsg.pin();
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
		handler.onReaction(packet);
	}
});