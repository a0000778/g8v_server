var crypto=require('crypto');
var formidable=require('formidable');
var DB;
const lifeTime=2592000;//有效時間(秒)，超時後從資料庫刪除，預設30天
const checkLifeTime=86400000;//清理間隔時間(毫秒)，檢查超時間隔時間，預設1天
const cacheTime=3600000;//快取有效時間(毫秒)，超時後寫出記憶體，預設1小時
const dbLogTime=600000;//寫入資料庫間隔時間(毫秒)，預設10分鐘
const formLimit={
	'maxFields': 3,
	'maxFieldsSize': 512
};

var maps={};

function Map(){
	var nowTime=new Date().getTime();
	this.id=null;//地圖id，null=未確認
	this.points={};//標記點
	this.links=[];//在線列表
	this.lastLogTime=nowTime;//最後記錄時間
	this.lastUpdateTime=nowTime;//最後更動時間
	this.lastReadTime=nowTime;//最後讀取時間
	this.updatedPoints=[];//上次紀錄後更動了哪些點
	this.deletedPoints=[];//上次紀錄後刪除了哪些點
}
Map.prototype.sendAll=function(msg){
	msg=JSON.stringify(msg);
	this.links.forEach(function(link){
		link.send(msg);
	});
}
Map.prototype.join=function(link){
	this.lastReadTime=new Date().getTime();
	this.links.push(link);
	var points=this.points;
	var point;
	for(var hashName in points){
		point=points[hashName];
		link.send(JSON.stringify({
			'action': 'move',
			'name': point.name,
			'pos': point.pos,
			'module': point.module,
			'args': point.args
		}));
	}
	points=undefined;
	delete point,points;
	var _=this;
	link.on('message',function(data){
		if(data.type!='utf8') return;
		console.log(data.utf8Data);
		var msg=JSON.parse(data.utf8Data);
		switch(msg.action){
			case 'move':
				if(msg.name===undefined) return;
				if(msg.pos!==undefined && (Number.isNaN(msg.pos[0]) || Number.isNaN(msg.pos[1]))) return;
				if(msg.module!==undefined && 'string'!==typeof msg.module) return;
				if(!Array.isArray(msg.args)) return;
				_.movePoint(msg.name,msg.pos,msg.module,msg.args);
			break;
			case 'delete':
				_.deletePoint(msg.name);
			break;	
		}
	});
	link.on('close',function(){
		_.lastReadTime=new Date().getTime();
		_.links.splice(_.links.indexOf(link),1);
		_=link=undefined;
		delete _,link;
	});
	link.send('{"action":"viewAll"}');
}
Map.prototype.movePoint=function(name,pos,module,args){
	if(name===undefined) return;
	var hashName=md5(name);
	var point
	if(!(point=this.points[hashName])){
		if(pos===undefined) return;
		point=this.points[hashName]={
			'name': name,
			'pos': pos,
			'module': '',
			'args': []
		};
	}else if(pos!=undefined) point.pos=pos;
	if(module!=undefined) point.module=module;
	if(args!=undefined) point.args=args;
	this.lastUpdateTime=new Date().getTime();
	if(this.updatedPoints.indexOf(hashName)<0)
		this.updatedPoints.push(hashName);
	this.sendAll({
		'action': 'move',
		'name': name,
		'pos': pos,
		'module': module,
		'args': args
	});
}
Map.prototype.deletePoint=function(name){
	var hashName=md5(name);
	if(!this.points[hashName]) return;
	var pointId=this.points[hashName].id;
	if(pointId){
		if(this.deletedPoints.indexOf(pointId)<0)
			this.deletedPoints.push(pointId);
		var checkUpdated;
		if(checkUpdated=this.updatedPoints.indexOf(name)>=0)
			this.updatedPoints.splice(checkUpdated,1);
	}
	this.points[hashName]=undefined;
	delete this.points[hashName];
	this.lastUpdateTime=new Date().getTime();
	this.sendAll({
		'action': 'delete',
		'name': name
	});
}

function md5(data){
	return crypto.createHash('md5').update(data).digest('hex');
}
function getMap(name){
	var hashName=md5(name);
	var map;
	if(map=maps[hashName])
		return map;
	map=maps[hashName]=new Map();
	DB.query(
		'SELECT `points`.* \
		FROM `maps`,`points` \
		WHERE `maps`.`name`=? AND `maps`.`id`=`points`.`mapId`',
		[hashName],
		function(err,points){
			if(!points.length){
				map.id=false;
				return;
			}
			map.id=points[0].mapId;
			points.forEach(function(point){
				var hashName=md5(point.name);
				if(this.points[hashName]){
					this.points[hashName].id=point.id;
					return;
				}
				point=this.points[hashName]={
					'id': point.id,
					'name': point.name,
					'pos': [point.posX,point.posY],
					'module': point.module,
					'args': JSON.parse(point.args)
				};
				this.sendAll({
					'action': 'move',
					'name': point.name,
					'pos': point.pos,
					'module': point.module,
					'args': point.args
				});
			},map);
			map.sendAll({'action': 'viewAll'});
		}
	);
	return map;
}
var writeDB=(function(){
	var createMap=function(hashName,callback){
		var map=maps[hashName];
		DB.query(
			'INSERT INTO `maps` (`name`,`lastReadTime`) VALUE (?,?)',
			[hashName,Math.floor(map.lastReadTime/1000)],
			function(err,result){
				if(err){
					console.log('[mapPoint] 無法建立地圖 hashName=%s',hashName);
					return;
				}
				map.id=result.insertId;
				writeMap(hashName,callback);
			}
		);
	};
	var writeMap=function(hashName,callback){
		var waitQueryCount=0;
		var map=maps[hashName];
		var mapId=map.id;
		map.lastLogTime=new Date().getTime();
		waitQueryCount++;
		DB.query(
			'UPDATE `maps` SET `lastReadTime`=? WHERE `id`=?',
			[Math.floor(map.lastReadTime/1000),mapId],
			function(err){
				if(err){
					console.log('[mapPoint] 地圖最後讀取時間更新失敗 id=%d',mapId);
				}
				--waitQueryCount || callback();
			}
		);
		if(map.updatedPoints.length){
			map.updatedPoints.forEach(function(key,index,o){
				var point=this[key];
				waitQueryCount++;
				if(point.id)
					DB.query(
						'UPDATE `points` SET `posX`=?, `posY`=?, `module`=?,`args`=? WHERE `id`=?',
						[point.pos[0],point.pos[1],point.module,JSON.stringify(point.args),point.id],
						function(err){
							if(err)
								console.log('[mapPoint] 更新標記點失敗 id=%d',point.id);
							point=undefined;
							delete point;
							--waitQueryCount || callback();
						}
					);
				else
					DB.query(
						'INSERT INTO `points` (`mapId`,`name`,`posX`,`posY`,`module`,`args`) VALUE (?,?,?,?,?,?)',
						[mapId,point.name,point.pos[0],point.pos[1],point.module,JSON.stringify(point.args)],
						function(err,result){
							if(err)
								console.log('[mapPoint] 新增標記點失敗 map=%s,name=%s',hashName,point.name);
							else
								point.id=result.insertId;
							point=undefined;
							delete point;
							--waitQueryCount || callback();
						}
					);
			},map.points);
			map.updatedPoints=[];
		}
		if(map.deletedPoints.length){
			var list=map.deletedPoints;
			waitQueryCount++;
			DB.query('DELETE FROM `point` WHERE `id` IN (?)',[list],function(err){
				if(err){
					console.log('[mapPoint] 刪除標記點失敗 id=%s',list.join(','));
				}
				list=undefined;
				delete list;
				--waitQueryCount || callback();
			});
			map.deletedPoints=[];
		}
	};
	return function(callback){
		var jobCount=0;
		var cb=function(){
			--jobCount || callback===undefined || callback();
		};
		var outTime=new Date().getTime()-cacheTime;
		var hashName,map;
		for(hashName in maps){
			map=maps[hashName];
			if(map.updatedPoints.length || map.deletedPoints.length){
				jobCount++;
				if(map.id)
					writeMap(hashName,cb);
				else
					createMap(hashName,cb);
			}
			if(map.links.length && map.lastReadTime<outTime){
				maps[hashName]=undefined;
				delete maps[hashName];
			}
		}
		map=undefined;
		delete map,hashName;
		jobCount || callback===undefined || callback();
	};
})();

//定時分散寫入
setInterval(writeDB,dbLogTime);
//定時清理資料庫
setInterval(function(){
	var expTime=Math.floor(new Date().getTime()/1000-lifeTime);
	DB.query('SELECT `id`,`name` FROM `maps` WHERE `lastReadTime`<?',[expTime],function(err,deleteList){
		deleteList=deleteList.reduce(function(r,v){
			if(maps[v.name]) return r;
			r.push(v.id);
			return r;
		},[]);
		DB.query('DELETE FROM `maps` WHERE `id` IN (?)',[deleteList],function(err){
			if(err){
				console.log('[mapPoint] 清理地圖資料失敗，目標清單 id=%s，錯誤訊息：%s',deleteList.join(','),err);
			}
		});
		DB.query('DELETE FROM `points` WHERE `mapId` IN (?)',[deleteList],function(err){
			if(err){
				console.log('[mapPoint] 清理標記點資料失敗，目標清單 id=%s，錯誤訊息：%s',deleteList.join(','),err);
			}
		});
	});
},checkLifeTime);

module.exports={
	'load': function(control){
		DB=control.connectDB();
		var loaded=(function(control){
			var step=2;
			return function(){
				if(--step) return;
				delete step;
				loaded=undefined;
				delete loaded;
				control.onLoad('mapPoint');
			}
		})(control);
		DB.query(
			'CREATE TABLE IF NOT EXISTS `maps` (\
				`id` int(10) unsigned NOT NULL AUTO_INCREMENT,\
				`name` char(32) NOT NULL,\
				`lastReadTime` int(10) unsigned NOT NULL,\
				PRIMARY KEY (`id`),\
				KEY `mapId` (`name`)\
			) ENGINE=MyISAM  DEFAULT CHARSET=latin1 COMMENT=\'地圖\' AUTO_INCREMENT=1;',
			function(err){
				if(!err){
					loaded();
					return;
				}
				console.error('[mapPoint] 表 maps 檢查或建立失敗');
				process.exit();
			}
		);
		DB.query(
			'CREATE TABLE IF NOT EXISTS `points` (\
				`id` int(10) unsigned NOT NULL AUTO_INCREMENT,\
				`mapId` int(10) unsigned NOT NULL,\
				`name` varchar(40) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,\
				`posX` double(10,7) NOT NULL,\
				`posY` double(10,7) NOT NULL,\
				`module` varchar(20) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,\
				`args` varchar(255) CHARACTER SET utf8 COLLATE utf8_unicode_ci NOT NULL,\
				PRIMARY KEY (`id`),\
				KEY `mapId` (`mapId`)\
			) ENGINE=MyISAM DEFAULT CHARSET=latin1 COMMENT=\'標記點\' AUTO_INCREMENT=1;',
			function(err){
				if(!err){
					loaded();
					return;
				}
				console.error('[mapPoint] 表 points 檢查或建立失敗');
				process.exit();
			}
		);
		control.mountHttp('post','/:name(\\w+)',function(req,res){
			var name=req.params.name;
			var map=getMap(name);
			var form=new formidable.IncomingForm(formLimit);
			form.on('error',function(e){
				req.connection.destroy();
			});
			form.parse(req, function(err,fields){
				switch(fields.action){
					case 'move':
						var pos=fields.pos.split(',');
						pos[0]=parseFloat(pos[0],10);
						pos[1]=parseFloat(pos[1],10);
						var args=JSON.parse(fields.args);
						if(Number.isNaN(pos[0]) || Number.isNaN(pos[1]) || !Array.isArray(args)){
							res.writeHead(400);
							res.end();
							return;
						}
						map.movePoint(fields.name,pos,fields.module,args);
					break;
					case 'delete':
						map.deletePoint(fields.name);
					break;
					default:
						res.writeHead(404);
						res.end();
						return;
				}
				res.writeHead(200);
				res.end();
			});
		});
		control.mountWebSocket('mapPoint',/^\/\w+$/,function(url,link){
			var name=url.pathname.substring(1,url.pathname.length);
			getMap(name).join(link);
		});
	},
	'unload': function(control){
		for(var hashName in maps){
			maps[hashName].links.forEach(function(link){
				link.close();
			});
		}
		writeDB(function(){
			control.onUnload('mapPoint');
		});
	}
};