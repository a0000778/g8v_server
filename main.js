console.log('G8V電視牆 伺服端 v1.0.6 by a0000778');
var fs=require('fs');
var path=require('path');

var config=require('./config.js');

var countConnect=0;
var servers={};
var resources={};
var control={
	'mountHttp': function(method,path,func){
		this.startHttp();
		servers.httpRouter[method.toLowerCase()](path,func);
		return this;
	},
	'mountWebSocket': function(protocol,path,func){
		this.startWebSocket();
		servers.webSocketRouter.mount(path,protocol,function(request){
			if(countConnect>=config.maxConnect){
				request.reject(503,'在線人數達上限');
				return;
			}
			countConnect++;
			var link=request.accept(request.origin);
			link.on('close',function(){
				countConnect--;
			});
			func(request.resourceURL,link);
		});
		return this;
	},
	'connectDB': function(){
		if(!resources.db){
			resources.db=require('mysql').createConnection({
				'host': config.db.host,
				'port': config.db.port,
				'user': config.db.user,
				'password': config.db.pass,
				'database': config.db.name
			});
		}
		return resources.db;
	},
	'startHttp': function(){
		if(servers.http) return;
		var server=servers.http=require(config.ssl? 'https':'http').createServer(config.ssl);
		servers.httpRouter=require('light-router');
		server
			.on('request',function(req,res){
				res.setHeader('Access-Control-Allow-Origin',req.headers['origin']);
				servers.httpRouter.call(this,req,res);
			})
			.on('error',function(e){
				if(e.code==='EADDRINUSE'){
					console.error('port %d 已使用',config.port);
				}else
					console.error(e);
				process.exit();
			})
		;
		return this;
	},
	'startWebSocket': function(){
		if(servers.webSocket) return;
		this.startHttp();
		var websocket=require('websocket');
		servers.webSocket=new websocket.server({
			'httpServer': servers.http
		});
		servers.webSocketRouter=new websocket.router();
		servers.webSocketRouter.attachServer(servers.webSocket);
		return this;
	},
	'onLoad': function(moduleName){
		if(!G8VModule[moduleName]){
			console.error('模組 %s 未載入卻提示載入完成', moduleName);
			process.exit();
		}
		var at;
		if((at=waitingModule.indexOf(moduleName))<0) return;
		waitingModule.splice(at,1);
		if(waitingModule.length) return;
		delete G8VModule.loading;
		servers.http && servers.http.listen(config.port,config.ip);
		console.log('載入完畢！');
	},
	'onUnload': function(moduleName){
		if(!G8VModule[moduleName])
			console.error('模組 %s 未載入卻提示卸載完成', moduleName);
		var at;
		if((at=waitingModule.indexOf(moduleName))<0) return;
		waitingModule.splice(at,1);
		if(waitingModule.length) return;
		servers.webSocket && servers.webSocket.shutDown();
		console.log('卸載完畢');
		process.exit();
	}
};

var G8VModule={
	'loading': true
};
var waitingModule=['loading'];
fs.readdirSync('./module').forEach(function(name){
	name=name.match(/^(\w+)\.js$/);
	if(name && fs.statSync(name[0]=path.join('.','module',name[0])).isFile()){
		console.log('載入模組 %s ...',name[1]);
		waitingModule.push(name[1]);
		this[name[1]]=require('./'+name[0]);
		this[name[1]].load(control);
	}
},G8VModule);
control.onLoad('loading');

process.once('SIGINT',function(e){
	process.on('SIGINT',function(){
		console.log('卸載中...');
	});
	console.log('開始卸載...');
	servers.http && servers.http.close();
	waitingModule.push('unloading');
	G8VModule.unloading=true;
	var mod;
	for(mod in G8VModule){
		if(mod==='unloading') return;
		console.log('關閉模組 %s ...',mod);
		waitingModule.push(mod);
		G8VModule[mod].unload(control);
	}
	control.onUnload('unloading');
});
process.on('error',function(e){
	console.error('全域錯誤: %s',e.toString());
})