var crypto=require('crypto');
var http=require('http');
var https=require('https');
var formidable=require('formidable');

const cacheTime=3600000;//快取有效時間(毫秒)
const cache404Time=600000;//找不到的快取時間(毫秒)
const cacheLive=180000;//即時狀態的快取時間(毫秒)
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
			return;
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
source.youtube=(function(){
	const format=/^c\/[a-zA-Z0-9_-]+\/live$/;//僅限處理以客製化網址名稱取得當前直播影片ID的情況
	var cache={
		'key': [],
		'result': [],
		'expire': []
	};
	setInterval(function(){
		var now=Date.now();
		cache.checkTime.reduce(function(r,checkTime,index){
			if(expire<now)
				r.push(index);
			return r;
		},[]).reverse().forEach(function(index){
			cache.key.splice(index,1);
			cache.result.splice(index,1);
			cache.expire.splice(index,1);
		});
	},cacheLive);
	return function(fields,req,res){
		var path=fields.path;
		if(!format.test(path)){
			res.writeHead(400);
			res.end();
			return;
		}
		var md5sum=md5(path);
		var cacheIndex=cache.key.indexOf(md5sum);
		if(cacheIndex!==-1 && cache.expire[cacheIndex]>=Date.now()){
			var result=cache.result[cacheIndex];
			if(result)
				res.end(result);
			else{
				res.writeHead(404);
				res.end();
			}
			return;
		}
		https.get('https://www.youtube.com/'+path,function(result){
			var data=[];
			result.on('data',function(buf){
				data.push(buf);
			}).on('end',function(){
				data=Buffer.concat(data).toString().match(/<link rel="shortlink" href="https:\/\/youtu\.be\/([a-zA-Z0-9_-]+)">/);
				if(data){
					res.end(data[1]);
					cache.key.push(md5sum);
					cache.result.push(data[1]);
					cache.expire.push(Date.now()+cacheLive);
				}else{
					res.writeHead(404);
					res.end();
					cache.key.push(md5sum);
					cache.result.push(null);
					cache.expire.push(Date.now()+cacheLive);
				}
			});
		}).on('error',function(error){
			res.writeHead(500);
			res.end();
		});
	}
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