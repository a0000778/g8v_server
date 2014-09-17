//var fs=require('fs');
module.exports={
	'ip': undefined,
	'port': 8888,
	'ssl': false,
	/*{
		'key': fs.readFileSync('./ssl-key.pem'),
		'cert': fs.readFileSync('./ssl-cert.pem')
	}*/
	'maxConnect': 500//WebSocket 最大連線數
}