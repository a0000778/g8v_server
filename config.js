//var fs=require('fs');
module.exports={
	'ip': undefined,
	'port': 8888,
	'ssl': false,
	/*{
		'key': fs.readFileSync('./ssl-key.pem'),
		'cert': fs.readFileSync('./ssl-cert.pem')
	}*/
	
	'db':{
		'host': 'localhost',
		'user': 'g8v',
		'pass': '',
		'name': 'g8v'
	},
	
	'maxConnect': 500//WebSocket 最大連線數
}