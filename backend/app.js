import { Server } from 'socket.io'
import express from 'express'
import http from 'http'

const app = express()
const server = http.createServer(app)
const io = new Server(server, {
	cors: {
		origin: 'http://localhost:5173',
		methods: ['GET', 'POST'],
	},
})

io.on('connection', (socket) => {
	console.log('A user connected:', socket.id)

	// Relay drawing updates
	socket.on('draw', (data) => {
		console.log('Drawing:', data)
		socket.broadcast.emit('draw', data)
	})

	// Relay modify path
	socket.on('modifyPath', (data) => {
		console.log('Modifying path:', data)
		socket.broadcast.emit('modifyPath', data)
	})

	// Relay shape creation
	socket.on('addShape', (data) => {
		console.log('Adding shape:', data)
		socket.broadcast.emit('addShape', data)
	})

	// Relay modify shape
	socket.on('modifyShape', (data) => {
		console.log('Modifying shape:', data)
		socket.broadcast.emit('modifyShape', data)
	})

	// Relay arrow creation
	socket.on('addArrow', (data) => {
		console.log('Adding arrow between shapes:', data.id1, data.id2)
		socket.broadcast.emit('addArrow', data)
	})

	// Relay arrow update
	socket.on('updateArrow', (data) => {
		console.log('Updating arrow between shapes:', data)
		socket.broadcast.emit('updateArrow', data)
	})

	// Relay clearing
	socket.on('clear', () => {
		console.log('Clearing canvas')
		socket.broadcast.emit('clear')
	})

	socket.on('disconnect', () => {
		console.log('User disconnected:', socket.id)
	})
})

server.listen(4000, () => {
	console.log('Socket.IO server running on port 4000')
})
