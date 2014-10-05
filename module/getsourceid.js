var crypto=require('crypto');
var http=require('http');
var formidable=require('formidable');

const cacheTime=3600000;//快取有效時間(毫秒)
const cache404Time=600000;//找不到的快取時間(毫秒)
const formLimit={
	'maxFields': 5,
	'maxFieldsSize': 1024
};
function md5(data){
	return crypto.createHash('md5').update(data).digest('hex');
}
var source={};
source.ustream=(function(){
	const format=/^(channel\/)?([-+_~.\d\w]|%[a-fA-F\d]{2})+$/;
	const isChannelId=/^(channel\/)?(\d+)$/;
	var cache={};
	setInterval(function(cache){
		var nowTime=new Date().getTime();
		for(var k in cache){
			if(cache[k].exp>nowTime) continue;
			cache[k]=undefined;
			delete cache[k];
		}
	},cacheTime,cache);
	return function(fields,req,res){
		var path=fields.path;
		if(!format.test(path)){
			res.writeHead(400);
			res.end();
		}
		var checkIsChannelId=path.match(isChannelId);
		if(checkIsChannelId){
			res.write(checkIsChannelId[2]);
			res.end();
			return;
		}
		var md5sum=md5(path);
		var cacheResult=cache[md5sum];
		if(cacheResult && cacheResult.exp>new Date().getTime()){
			if(cacheResult.result)
				res.write(cacheResult.result);
			else
				res.writeHead(404);
			res.end();
			return;
		}
		http.get('http://www.ustream.tv/'+path,function(result){
			var id=result.headers['x-ustream-content-id'];
			if(!id){
				res.writeHead(404);
				res.end();
				cache[md5sum]={'result':null,'exp':new Date().getTime()+cacheTime};
				return;
			}
			res.write(id);
			res.end();
			cache[md5sum]={'result':id,'exp':new Date().getTime()+cacheTime};
		}).on('error',function(e){
			res.writeHead(500);
			res.end();
		});
	};
})();

module.exports={
	'load': function(control){
		control.mountHttp('post','/getSourceId',function(req,res){
			var form=new formidable.IncomingForm(formLimit);
			form.on('error',function(e){
				req.connection.destroy();
			});
			form.parse(req, function(err,fields){
				var s=fields.source;
				if(source[s] && !Object.prototype[s]){
					source[s](fields,req,res);
					return;
				}
				res.writeHead(400);
				res.end();
			});
		});
		control.onLoad('getsourceid');
	},
	'unload': function(control){
		control.onUnload('getsourceid');
	}
};