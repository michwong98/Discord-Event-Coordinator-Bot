const Discord = require("discord.js");
const auth = require("./auth.json");
const mysql = require("mysql")
const Handler = require("./handler.js");
const readline = require("readline");
const clear = require("clear");
//Wrapper class for MySQL client.
class Database {

	constructor(config, token) {
		this.config = config;
		this.handleDisconnect(); //Connects to database.
		client.login(token)
		.catch(error => console.error);	
	} //End constructor.

	handleDisconnect() {
		this.connection = mysql.createConnection(this.config);
		this.connection.connect(function (error) {
			if (error) {
				console.log("Error connecting to database: ", error);
				setTimeout(this.handleDisconnect, 10000) //Attempts reconnect after 10 seconds.
			}
			console.log("Database connection.");
		}.bind(this));
		this.connection.on("error", function (error) {
			if (!error.fatal) { //Not fatal error.
				return;
			}
			if (error.code === "PROTOCOL_CONNECTION_LOST") { //Connection to database lost.
				this.handleDisconnect(); //Attempts to reconnect.
			} else {
				throw error;
			}
		}.bind(this));
	}

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

var client, databaseConfig;

//Prompts input for database password.
new Promise(function(resolve, reject) { 
	const r1 = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	r1.question("Enter Database Password:", answer => {
		r1.close();
		clear();
		resolve(answer);
	});
})
.then(password => {

	databaseConfig = {
		host: auth.db_host,
		user: auth.db_user,
		password: password,
		database: auth.db_name,
		autoReconnect: true,
		maxReconnects: 10
	};
	client = new Discord.Client({autoReconnect: true});

	client.on("ready", () => {
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

	client.on("reconnecting", () => {
		console.log(`${client.user.tag} reconnecting.`);
	});

	const database = new Database(databaseConfig, auth.token);

	const handler = new Handler(database, client);

})
.catch(console.error);

