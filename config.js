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
		'port': 3306,
		'user': 'g8v',
		'pass': '',
		'name': 'g8v',
		'connectionLimit': 10
	},
	
	'maxConnect': 500,//WebSocket 最大連線數
	
	'mod_urlShorten': {
		'bitly_user': '',
		'bitly_apiKey': '',
		'allowPreifx': 'http://a0000778.github.io/g8v/#',
		'cacheSize': 5000,
		'cacheExpire': 600
	}
}