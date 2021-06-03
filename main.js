const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

const bodyParser = require('body-parser');
const mysql = require('mysql');

const port = 3000;

const mysqlSync = require('sync-mysql');
const dbSync = new mysqlSync({
  host: 'localhost',
  user: 'root',
  password: 'ljsql934',
  database: 'gamespring',
});

const session = require('express-session');
const { throws } = require('assert');
app.use(
  session({
    secret: 'secretWords',
    resave: false,
    saveUninitialized: true,
  })
);

const db_info = {
  host: 'localhost',
  port: '3306',
  user: 'root',
  password: 'ljsql934',
  database: 'gamespring',
};

const dbConnect = mysql.createConnection(db_info);

dbConnect.connect();

app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/page', express.static('public'));
app.use('/socket.io', express.static('node_modulessocket.ioclient-dist'));

io.on('connection', (socket) => {
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  socket.on('leaveRoom', (roomId, name) => {
    console.log(name + ' leave a ' + roomId + ' room');
    // dbSync.query(`UPDATE room SET userNumber = userNumber - 1 where idx = '${roomId}';`)
    dbSync.query(`DELETE FROM joined_user where roomId = '${roomId}' AND userId = '${name}';`);
    socket.leave(roomId);
    io.to(roomId).emit('leaveRoom', roomId, name);
  });

  socket.on('joinRoom', (roomId, name) => {
    console.log(name + ' join a ' + roomId + ' room');
    // dbSync.query(`UPDATE room SET userNumber = userNumber + 1 where idx = '${roomId}';`)
    dbSync.query(`INSERT INTO joined_user (roomId, userId) VALUES('${roomId}', '${name}');`);
    socket.join(roomId);
    io.to(roomId).emit('joinRoom', roomId, name);
  });

  socket.on('leaveDM', (roomId, name) => {
    console.log(name + ' leave a ' + roomId + ' room');
    socket.leave(roomId);
    io.to(roomId).emit('leaveRoom', roomId, name);
  });

  socket.on('joinDM', (roomId, name) => {
    console.log(name + ' join a ' + roomId + ' room');
    socket.join(roomId);
    io.to(roomId).emit('joinRoom', roomId, name);
  });

  socket.on('chat message', (roomId, name, msg) => {
    io.to(roomId).emit('chat message', name, msg);
  });
});

app.get('/page/friends1', (req, res) => {
  if (req.session.uid === undefined) {
    res.send(
      `<script> alert('로그인 정보 만료'); location.href = '../page/signin.html';</script>`
    );
  }
  const userID = req.session.uid;
  console.log(userID)
  const sql = `
  SELECT a.str as str, DATE_FORMAT(created, '%y-%m-%d') as created FROM 
(SELECT id as str, created FROM user) a, 
(SELECT str FROM 
(SELECT sender as str FROM follow_list WHERE receiver = '${userID}') A 
WHERE str 
NOT IN (SELECT DISTINCT str FROM 
    (SELECT receiver as str FROM follow_list WHERE sender = '${userID}') B
)) b 
WHERE a.str = b.str; 
  `;

  dbConnect.query(sql, (err, result) => {
    if (err) {
      res.send(
        `<script> alert('친구신청 로딩 오류'); location.href = './menu';</script>`
      );
    }
    console.log(result);
    res.render('friends1', { data: result });
  });
});

app.get('/logout', (req, res) => {
  if (req.session.uid !== undefined) {
    req.session.destroy((err) => {
          if (err) console.log(err)
          else{
            console.log('세션 삭제 성공');
            res.send(
                `<script> location.href = '/page/signin.html';</script>`
            );
          }
        }
    );
  }


});

app.get('/page/friends2', (req, res) => {
  if (req.session.uid === undefined) {
    res.send(
      `<script> alert('로그인 정보 만료'); location.href = '../page/signin.html';</script>`
    );
  }
  const userID = req.session.uid;

  const sql = `
  SELECT a.str as str, DATE_FORMAT(b.created, '%y-%m-%d') as created FROM
 (
 SELECT A.str FROM 
(SELECT receiver as str FROM follow_list WHERE sender = '${userID}') A, 
(SELECT sender as str FROM follow_list WHERE receiver = '${userID}') B 
WHERE A.str = B.str
) a,
(SELECT id as str, created FROM user ) b
 WHERE a.str = b.str;

  `;

  dbConnect.query(sql, (err, result) => {
    if (err) {
      res.send(
        `<script> alert('친구신청 로딩 오류'); location.href = './menu';</script>`
      );
    }
    console.log(result);

    res.render('friends2', { data: result, uid: userID });
  });
});

app.get('/page/users', (req, res) => {
  if (req.session.uid === undefined) {
    res.send(
      `<script> alert('로그인 정보 만료'); location.href = '../page/signin.html';</script>`
    );
  }
  const userID = req.session.uid;

  const sql = `SELECT 
str, friendNumber,
DATE_FORMAT(created, '%y-%m-%d') as created,
IF(str IN 
(
SELECT A.str FROM 
(SELECT receiver as str FROM follow_list WHERE sender = '${userID}') A, 
(SELECT sender as str FROM follow_list WHERE receiver = '${userID}') B 
WHERE A.str = B.str
) , 1, 0) as isFriend, 
IF(str IN 
(
SELECT receiver as str FROM follow_list WHERE sender = '${userID}'
) , 1, 0) as isSend
FROM (SELECT id as str, friendNumber, created FROM user) A;`;

  dbConnect.query(sql, (err, result) => {
    if (err) {
      res.send(
        `<script> alert('방 정보 로딩 오류'); location.href = './menu';</script>`
      );
    }
    console.log(result)
    res.render('users', { data: result, userID: userID });
  });
});

app.get('/page/chat/:idx', (req, res) => {
  const roomId = req.params.idx;
  const userId = req.session.uid;
  const joinedUsers =  dbSync.query(`SELECT DISTINCT userId FROM joined_user 
  where roomId='${roomId}' AND userId != '${userId}';`);
  console.log(joinedUsers)
  res.render('chatting', { roomId: roomId, userId: userId, joinedUsers: joinedUsers });
});

app.get('/page/dm/:idx', (req, res) => {
  const roomId = req.params.idx;
  const userId = req.session.uid;
  const opponentId = req.query.opponentId;
  console.log(roomId, userId);
  res.render('dm', { roomId: roomId, userId: userId, opponentId: opponentId });
});

app.get('/page/rooms', (req, res) => {
  if (req.session.uid === undefined) {
    res.send(
        `<script> alert('로그인 정보 만료'); location.href = '../page/signin.html';</script>`
    );
  }

  const allRooms = dbSync.query(`SELECT idx FROM room;`);

  const _a = dbSync.query(`select DISTINCT userId from joined_user WHERE roomId = '${allRooms[0].idx}';`);
  const _b = dbSync.query(`select DISTINCT userId from joined_user WHERE roomId = '${allRooms[1].idx}';`);
  const sql = `SELECT * FROM room`;
  dbConnect.query(sql, (err, result) => {
    if (err) {
      res.send(
        `<script> alert('방 정보 로딩 오류'); location.href = './menu';</script>`
      );
    }
    res.render('rooms', { data: result, joinedUserNumbers : [_a.length, _b.length]});
  });
});

app.post('/friend-delete', async (req, res) => {
  if (req.session.uid === undefined) {
    res.send(`<script>location.href = './page/signin.html';</script>`);
  }
  const sender = req.session.uid;
  const receiver = req.body.uid;

  dbSync.query(`UPDATE user SET friendNumber = friendNumber - 1 where id = '${req.session.uid}';`)

  const sql1 = `DELETE FROM follow_list WHERE sender = '${sender}' AND receiver = '${receiver}';`;
  await dbConnect.query(sql1, function (err, rows, fields) {
    if (err) console.log(err);
  });

  const sql2 = `DELETE FROM follow_list WHERE sender = '${receiver}' AND receiver = '${sender}';`;
  dbConnect.query(sql2, function (err, rows, fields) {
    if (err) {
      console.log(err);
      res.send(
        `<script>location.href = './page/friends2';  alert('친구삭제 실패'); </script>`
      );
    } else {
      res.send(`<script>location.href = './page/friends2';</script>`);
    }
  });
});

app.post('/following', function (req, res) {
  if (req.session.uid === undefined) {
    res.send(
      `<script> alert('로그인 정보 만료'); location.href = './page/signin.html';</script>`
    );
  }
  const sender = req.session.uid;
  const receiver = req.body.uid;
  var sql = 'INSERT INTO follow_list(sender,receiver)VALUES(?,?)';
  var params = [sender, receiver];
  dbConnect.query(sql, params, function (err, rows, fields) {
    if (err) {
      console.log(err);
      res.send(
        `<script> alert('친구요청 실패'); location.href = './page/users';</script>`
      );
    } else {
      res.send(
        `<script> alert('친구요청 성공'); location.href = './page/users';</script>`
      );
    }
  });
});

app.post('/following-denied', (req, res) => {
  if (req.session.uid === undefined) {
    res.send(`<script>location.href = './page/signin.html';</script>`);
  }
  const sender = req.session.uid;
  const receiver = req.body.uid;

  const sql = `DELETE FROM follow_list WHERE sender = '${receiver}' AND receiver = '${sender}';`;
  dbConnect.query(sql, function (err, rows, fields) {
    if (err) {
      console.log(err);
      res.send(
        `<script>location.href = './page/friends1';  alert('친구거절 실패'); </script>`
      );
    } else {
      res.send(`<script>location.href = './page/friends1';</script>`);
    }
  });
});

app.post('/following-accepted', (req, res) => {
  if (req.session.uid === undefined) {
    res.send(`<script>location.href = './page/signin.html';</script>`);
  }
  const sender = req.session.uid;
  const receiver = req.body.uid;
  const sql = 'INSERT INTO follow_list(sender,receiver)VALUES(?,?)';
  const params = [sender, receiver];
  dbSync.query(`UPDATE user SET friendNumber = friendNumber + 1 where id = '${req.session.uid}';`)
  dbConnect.query(sql, params, function (err, rows, fields) {
    if (err) {
      console.log(err);
      res.send(
        `<script>location.href = './page/friends1';  alert('친구수락 실패'); </script>`
      );
    } else {
      res.send(`<script>location.href = './page/friends1';</script>`);
    }
  });
});

app.post('/signin', function (req, res) {
  const post = req.body;
  // const sql = `SELECT * FORM user WHERE id=${post.id}`;
  const sql = `SELECT * FROM user WHERE id = '${post.id}' AND pwd = '${post.pwd}'`;

  dbConnect.query(sql, function (err, result) {
    if (err) {
      res.send(
        `<script> alert('로그인 실패'); location.href = './page/sign.html';</script>`
      );
    }else{
      console.log(result)
      if(result.length === 0){
        console.log('에러확인')
        res.send(
            `<script> alert('가입되지 않은 유저'); location.href = './page/signin.html';</script>`
        );
      }
      else{
        req.session.uid = post.id;
        req.session.save();
        res.send(
            `<script> alert('로그인 성공!'); location.href = './page/rooms';</script>`
        );
      }
    }
  });
});

app.post('/signup', function (req, res) {
  var post = req.body;
  var sql = 'INSERT INTO user(id,pwd,created)VALUES(?,?,NOW())';
  var params = [post.id, post.pwd];
  console.log(post.id);
  dbConnect.query(sql, params, function (err, rows, fields) {
    if (err) {
      console.log(err);
      res.send(
        `<script> alert('회원가입 실패 아이디가 중복되었습니다!'); location.href = './page/signin.html';</script>`
      );
    } else {
      res.send(
        `<script> alert('회원가입 성공'); location.href = './page/signin.html';</script>`
      );
    }
  });
});

server.listen(port, () => {
  console.log(`Example app listening at http://54.180.121.234:${port}`);
});
