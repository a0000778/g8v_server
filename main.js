console.log('G8V電視牆 伺服端 v1.0.5 by a0000778');
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
		if((at=loadingModule.indexOf(moduleName))<0) return;
		loadingModule.splice(at,1);
		if(loadingModule.length) return;
		delete loadingModule;
		servers.http && servers.http.listen(config.port,config.ip);
		console.log('載入完畢！');
	}
};

var G8VModule={};
var loadingModule=[];
fs.readdirSync('./module').forEach(function(name){
	name=name.match(/^(\w+)\.js$/);
	if(name && fs.statSync(name[0]=path.join('.','module',name[0])).isFile()){
		console.log('載入模組 %s ...',name[1]);
		loadingModule.push(name[1]);
		this[name[1]]=require('./'+name[0]);
		this[name[1]].load(control);
	}
},G8VModule);
process.on('error',function(e){
	console.error('全域錯誤: %s',e.toString());
})