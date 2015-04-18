var Bitly=require('bitly');
var formidable=require('formidable');
var config=require('../config.js').mod_urlShorten;

const formLimit={
	'maxFields': 1,
	'maxFieldsSize': 2100
};

var bitlyApi=new Bitly(config.bitly_user,config.bitly_apiKey);
var cache=new Map();

function clearCache(){
	if(config.cacheSize>=cache.size)
		return;
	var expireTime=Date.now()-config.cacheExpire;
	cache.forEach(function(data,url){
		if(data.updateTime<expireTime)
			cache.delete(url);
	});
}

module.exports={
	'load': function(control){
		control.mountHttp('post','/urlShorten',function(req,res){
			var form=new formidable.IncomingForm(formLimit);
			form.on('error',function(e){
				req.connection.destroy();
			});
			form.parse(req, function(err,fields){
				var url=fields.url;
				if(typeof(url)==='string' && url.indexOf(config.allowPreifx)===0){
					if(cache.has(url)){
						var cacheData=cache.get(url);
						cacheData.updateTime=Date.now();
						res.write(cacheData.shortUrl);
						res.end();
						return;
					}
					bitlyApi.shorten(url,function(error,result){
						if(error || result.status_code!==200){
							res.writeHead(500);
							res.end();
							return;
						}
						cache.set(url,{
							'shrotUrl': result.data.url,
							'updateTime': Date.now()
						});
						res.write(result.data.url);
						res.end();
						clearCache();
					});
					return;
				}
				res.writeHead(400);
				res.end();
			});
		});
		control.onLoad('urlShorten');
	},
	'unload': function(control){
		control.onUnload('urlShorten');
	}
};