var fs      = require('fs')
var crypto  = require('crypto')
var express = require('express')
var ejs     = require('ejs')
var mongo   = require('mongodb')
var multer  = require('multer')
var io      = require('socket.io')()

var upload  = multer( {dest: 'uploaded'} )
var app     = express()
var valid   = [ ]
var database = 'mongodb://127.0.0.1/minishop'
app.engine('html', ejs.renderFile)
io.listen( app.listen(2000) )

io.on('connection', socket => {
	socket.on('message', m => {
		if (m.card) {
			var user = valid[m.card]
			socket.user = user;
			io.send({message: "<b>" + user.name + '</b> just joined.'})
		}
		if (m.message) {
			m.message = "<b>" + socket.user.name + ": </b>" + m.message
			io.send(m)
		}
	})
	socket.on('disconnect', () => {
		if (socket && socket.user) {
			var m = { message : "<b>" + socket.user.name + "</b> just left."}
			io.send(m)
		}
	})
})

app.get ('/', showIndex)
app.get ('/register', showRegister)
app.post('/register-user', registerUser)
app.get ('/login', showLogin)
app.post('/login', doLogin)
app.get ('/profile', showProfile)
app.get ('/logout', showLogout)
app.post('/save-profile', upload.single('photo'), makeProfile)
app.get ('/new', showNewTopic)
app.post('/new', upload.single('photo'), saveNewTopic)
app.get ('/view', showUserTopic)
app.get ('/show', showAll)
app.get ('/list', listAll)
app.get ('/chat', showChat)
app.get ('/search', showSearch)
app.get ('/result', showResult)

app.use(express.static('public'))
app.use(express.static('uploaded'))

function showIndex(req, res) {
	res.render('index.html')
}
function showRegister(req, res) {
	res.render('register.html')
}
function registerUser(req, res) {
	var s = ''
	req.on('data', piece => {
		s += piece
	})
	req.on('end', () => {
		var t = s.split('&')
		var info = {}
		for (var f of t) {
			var d = f.split('=')
			info[d[0]] = decodeURIComponent(d[1])
			if (d[0] == 'name') {
				info.name = info.name.replace(/\+/g, ' ')
			}
			if (d[0] == 'password') {
				info.password = crypto.createHmac('sha512', info.password)
									.update('mini-password')
									.digest('hex')
			}
		}
		
		mongo.MongoClient.connect(database, (error, db) => {
				var c = { email: info.email }
				db.collection('user').find(c).toArray(
					(error, data) => {
						if (data.length == 0) {
							db.collection('user').insert(info)
							res.redirect('/login')
						} else {
							res.redirect('/register?Duplicated')
						}
					}
				)
			}
		)
	})
}

function showLogin(req, res) {
	var card = extractSession(req.get('cookie'))
	if (valid[card]) {
		res.redirect('/profile')
	} else {
		res.render('login.html')
	}
}

function doLogin(req, res) {
	var s = ''
	req.on('data', piece => { s += piece })
	req.on('end', () => {
		var t = s.split('&')
		var info = { }
		for (var f of t) {
			var d = f.split('=')
			info[d[0]] = decodeURIComponent(d[1])
		}
		info.password = crypto.createHmac('sha512', info.password)
						.update('mini-password')
						.digest('hex')
		mongo.MongoClient.connect(database, (error, db) => {
				db.collection('user').find(info).toArray(
					(error, data) => {
						if (data.length == 0) {
							res.redirect("/login?Invalid Password")
						} else {
							var card = generateSession()
							valid[card] = data[0] // this card is valid
							res.set('Set-Cookie', 'session=' + card)
							res.redirect("/profile")
						}
					}
				)
			}
		)
	})
}

function generateSession() {
	var a = Math.random() * 1000000
	var b = Math.random() * 1000000
	var c = Math.random() * 1000000
	a = parseInt(a)
	b = parseInt(b)
	c = parseInt(c)
	return a + '-' + b + '-' + c
}

function extractSession(cookie) {
	cookie += ';'
	var start = cookie.indexOf('session=') + 8
	var stop  = cookie.indexOf(';', start)
	return cookie.substring(start, stop)
}

function showProfile(req, res) {
	var card = extractSession(req.get('cookie'))
	if (valid[card]) {
		var data = {user: valid[card]}
		res.render('profile.html', data)
	} else {
		res.redirect('/login')
	}
}

function showLogout(req, res) {
	var card = extractSession(req.get('cookie'))
	delete valid[card]
	res.render('logout.html')
}

function makeProfile(req, res) {
	fs.rename(req.file.path, req.file.path + '.png')
	mongo.MongoClient.connect(database, (error, db) => {
			var card = extractSession(req.get('cookie'))
			var old = { _id: valid[card]._id }
			var info = valid[card]
			info.photo = req.file.filename
			valid[card] = info
			db.collection('user').update(old, info)
			res.redirect('/profile')
		}
	)
}

function showNewTopic(req, res) {
	var cookie = req.get('cookie')
	var card = extractSession(cookie)
	if (valid[card]) {
		res.render('new-topic.html')
	} else {
		res.redirect('/login')
	}
}

function saveNewTopic(req, res) {
	var cookie = req.get('cookie')
	var card   = extractSession(cookie)
	var user   = valid[card]
	var info    = { }
	info.user   = user._id
	info.topic  = req.body.topic
	info.detail = req.body.detail
	if (req.body.category != 'All') {
		info.category = req.body.category
	}
	info.time   = new Date()
	if (req.file) {
		fs.rename(req.file.path, req.file.path + '.png')
		info.photo = req.file.filename
	}
	mongo.MongoClient.connect(database, (error, db) => {
		db.collection('post').insert(info)
		res.redirect('/profile')
	})
}

function showUserTopic(req, res) {
	var cookie = req.get('cookie')
	var card   = extractSession(cookie)
	if (valid[card]) {
		var id = valid[card]._id
		mongo.MongoClient.connect(database, (error, db) => {
			db.collection('post').find({user: id}).toArray((error, data) => {
				res.render('view.html', {post: data})
			})
		})
	} else {
		res.redirect('/login')
	}
}

function showAll(req, res) {
	mongo.MongoClient.connect(database, (error, db) => {
		db.collection('post').find().toArray((error, data) => {
			res.render('show.html', {post: data})
		})
	})
}

function listAll(req, res) {
	mongo.MongoClient.connect(database, (error, db) => {
		db.collection('post').find().toArray((error, data) => {
			res.send(data)
		})
	})
}

function showChat(req, res) {
	var cookie = req.get('cookie')
	var card   = extractSession(cookie)
	if (valid[card]) {
		res.render('chat.html')
	} else {
		res.redirect('/login')
	}
}

function showSearch(req, res) {
	res.render('search.html')
}

function showResult(req, res) {
	var e = new RegExp(req.query.data, "i")
	mongo.MongoClient.connect(database, (error, db) => {
		db.collection('post').find({topic: e}).toArray((error, data) => {
			res.render('result.html', {list: data})
		})
	})
}
