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

client.on("raw", async packet => {
	//Don't run on unrelated packets.
	if (["MESSAGE_REACTION_ADD", "MESSAGE_CREATE"].includes(packet.t) && packet.d.user_id !== client.user.id) {
		switch(packet.t) {
			case "MESSAGE_REACTION_ADD":
				handler.onReaction(packet);
				break;
			case "MESSAGE_CREATE":
				if (packet.d.content.substring(0, 2) === "e!") {
					handler.onCommand(packet);
				}
				break;
			default:
				break;
		}
	}
});