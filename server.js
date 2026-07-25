const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
// 跨域允许所有前端域名（适配Vercel）
const io = new Server(server, {
  cors: { origin: "*" }
});
app.use(express.static('./'));

// 房间存储 key=6位房间码
const rooms = {};
// AI难度配置
const AI_CONFIG = {
  easy: { accuracy: 0.2, moveSpeed: 0.8 },
  medium: { accuracy: 0.5, moveSpeed: 1 },
  hard: { accuracy: 0.85, moveSpeed: 1.2 }
};

// 生成6位随机字母数字房间码
function create6DigitRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for(let i=0;i<6;i++){
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('新玩家连接 ID:', socket.id);

  // 创建房间，生成6位房间码
  socket.on('createRoom', (roomSettings) => {
    let newRoomCode = create6DigitRoomCode();
    // 防止房间码重复
    while(rooms[newRoomCode]){
      newRoomCode = create6DigitRoomCode();
    }
    rooms[newRoomCode] = {
      players: {},
      aiEnemyList: [],
      aiTeammateList: [],
      settings: roomSettings
    };
    socket.join(newRoomCode);
    socket.emit('roomCreateSuccess', newRoomCode);
    console.log('创建房间成功 6位房间码:', newRoomCode);
  });

  // 输入6位房间码加入房间
  socket.on('joinTargetRoom', (roomCode) => {
    if (!rooms[roomCode]) return socket.emit('systemErr', '房间不存在，请核对6位房间码');
    const targetRoom = rooms[roomCode];
    const onlinePlayerCount = Object.keys(targetRoom.players).length;
    if (onlinePlayerCount >= 20) return socket.emit('systemErr', '房间已满，最多20名真人玩家');

    socket.join(roomCode);
    targetRoom.players[socket.id] = {
      uid: socket.id,
      team: null,
      soldierClass: 'assault',
      map: targetRoom.settings.mapId,
      pos: { x: 0, y: 2, z: 0 },
      rotation: { y: 0 },
      hp: 100,
      inVehicle: null
    };
    io.to(roomCode).emit('refreshPlayerList', targetRoom.players);
  });

  // 更新房间游戏设置
  socket.on('updateRoomSetting', (data) => {
    const room = rooms[data.roomCode];
    if (!room) return;
    room.settings = data.settingData;
    io.to(data.roomCode).emit('roomSettingUpdate', room.settings);
  });

  // 玩家移动同步
  socket.on('playerPositionSync', (data) => {
    const room = rooms[data.roomCode];
    if (!room || !room.players[socket.id]) return;
    room.players[socket.id].pos = data.pos;
    room.players[socket.id].rotation = data.rot;
    socket.to(data.roomCode).emit('remotePlayerPos', {
      id: socket.id,
      pos: data.pos,
      rot: data.rot
    });
  });

  // 射击、受伤、载具交互全局事件转发
  socket.on('gameGlobalEvent', (data) => {
    socket.to(data.roomCode).emit('receiveGlobalGameEvent', data);
  });

  // 玩家断开连接
  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomCode).emit('refreshPlayerList', room.players);
        if (Object.keys(room.players).length === 0) {
          delete rooms[roomCode];
          console.log('房间无人，自动销毁', roomCode);
        }
      }
    }
    console.log('玩家离线 ID:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`联机服务器启动成功，端口：${PORT}`);
});
