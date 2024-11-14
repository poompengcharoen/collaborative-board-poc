import * as fabric from 'fabric'

import { useEffect, useRef, useState } from 'react'

import { io } from 'socket.io-client'

// Initialize socket connection to server
const socket = io('http://localhost:4000')

const App = () => {
	const canvasRef = useRef(null) // Reference for the canvas DOM element
	const [canvas, setCanvas] = useState(null) // State to hold fabric canvas instance
	const [isDrawing, setIsDrawing] = useState(false) // State to toggle drawing mode
	const [selectedShapes, setSelectedShapes] = useState([]) // State to keep track of selected shapes for arrow creation

	useEffect(() => {
		const fabricCanvas = new fabric.Canvas(canvasRef.current) // Initialize fabric canvas
		setCanvas(fabricCanvas) // Save the fabric canvas instance to state
		setupSocketListeners(fabricCanvas) // Set up listeners for socket events

		// Handle 'path:created' event for drawing new paths
		fabricCanvas.on('path:created', (event) => {
			const newPath = event.path
			newPath.id = generateId() // Assign a unique ID to the new path
			socket.emit('draw', {
				path: newPath.path,
				options: newPath.toObject(),
				id: newPath.id,
			}) // Emit draw event to sync with other clients
			onModifyPath(newPath) // Set up event listeners for the new path's modifications
		})

		return () => {
			fabricCanvas.dispose() // Clean up fabric canvas on unmount
			cleanupSocketListeners() // Remove socket listeners on unmount
		}
	}, [])

	// Set up socket listeners to handle incoming drawing events from other clients
	const setupSocketListeners = (fabricCanvas) => {
		socket.on('draw', (data) => addPathToCanvas(fabricCanvas, data))
		socket.on('modifyPath', (data) => modifyObjectOnCanvas(fabricCanvas, data))
		socket.on('addShape', (data) => addShapeToCanvas(fabricCanvas, data))
		socket.on('modifyShape', (data) => modifyObjectOnCanvas(fabricCanvas, data))
		socket.on('addArrow', (data) => addArrowToCanvas(fabricCanvas, data))
		socket.on('updateArrow', (data) => updateArrowOnCanvas(fabricCanvas, data))
		socket.on('clear', () => fabricCanvas.clear())
	}

	// Clean up socket listeners on component unmount
	const cleanupSocketListeners = () => {
		socket.off('draw')
		socket.off('modifyPath')
		socket.off('addShape')
		socket.off('modifyShape')
		socket.off('addArrow')
		socket.off('updateArrow')
		socket.off('clear')
	}

	// Add a new path to the canvas with specified options
	const addPathToCanvas = (fabricCanvas, { path, options, id }) => {
		const newPath = new fabric.Path(path, options)
		newPath.id = id // Set unique ID
		fabricCanvas.add(newPath)
		onModifyPath(newPath) // Set up listeners for modifications to sync with other clients
	}

	// Modify existing object on the canvas based on socket data
	const modifyObjectOnCanvas = (fabricCanvas, { id, options }) => {
		const object = fabricCanvas.getObjects().find((obj) => obj.id === id)
		if (object) {
			object.set(options).setCoords() // Apply changes to object and update coordinates
			fabricCanvas.renderAll() // Re-render canvas to reflect changes
		}
	}

	// Add a shape to the canvas, either a circle or rectangle
	const addShapeToCanvas = (fabricCanvas, { id, type, options }) => {
		let shape
		if (type === 'circle') {
			shape = new fabric.Circle(options)
		} else if (type === 'rectangle') {
			shape = new fabric.Rect(options)
		}
		if (shape) {
			shape.id = id
			addShapeSelection(shape) // Enable shape selection for arrows
			fabricCanvas.add(shape)
			onModifyShape(fabricCanvas, shape) // Set up listeners for shape modifications
		}
		return shape
	}

	// Add an arrow connecting two shapes on the canvas
	const addArrowToCanvas = (
		fabricCanvas,
		{ id1, id2, lineId, arrowHeadId }
	) => {
		const shape1 = fabricCanvas.getObjects().find((obj) => obj.id === id1)
		const shape2 = fabricCanvas.getObjects().find((obj) => obj.id === id2)
		if (shape1 && shape2) {
			addArrow(fabricCanvas, shape1, shape2, lineId, arrowHeadId) // Create the arrow if both shapes exist
		}
	}

	// Update the position of an existing arrow on the canvas
	const updateArrowOnCanvas = (
		fabricCanvas,
		{ lineId, arrowHeadId, line, arrowHead }
	) => {
		const lineObject = fabricCanvas
			.getObjects()
			.find((obj) => obj.id === lineId)
		const arrowHeadObject = fabricCanvas
			.getObjects()
			.find((obj) => obj.id === arrowHeadId)
		if (lineObject && arrowHeadObject) {
			lineObject.set(line) // Update line position
			arrowHeadObject.set(arrowHead) // Update arrowhead position
			lineObject.setCoords()
			arrowHeadObject.setCoords()
			fabricCanvas.renderAll() // Re-render canvas to reflect changes
		}
	}

	// Toggle between drawing mode and selection mode
	const toggleDrawingMode = () => {
		setIsDrawing(!isDrawing)
		canvas.isDrawingMode = !isDrawing // Toggle fabric.js drawing mode
		canvas.freeDrawingBrush = new fabric.PencilBrush(canvas) // Set drawing tool to pencil brush
	}

	// Generate a unique identifier for shapes and paths
	const generateId = () => '_' + Math.random().toString(36).substr(2, 9)

	// Add a shape of specified type (circle or rectangle) to canvas and emit socket event
	const onAddShape = (type) => {
		const shapeOptions = {
			circle: {
				radius: 50,
				left: 0,
				top: 0,
				hasControls: true,
				fill: null,
				stroke: 'black',
			},
			rectangle: {
				left: 0,
				top: 0,
				width: 100,
				height: 100,
				hasControls: true,
				fill: null,
				stroke: 'black',
			},
		}
		const shape = addShapeToCanvas(canvas, {
			id: generateId(),
			type,
			options: shapeOptions[type],
		})
		if (shape) {
			socket.emit('addShape', { id: shape.id, type, options: shape.toObject() })
		}
	}

	// Event handlers for adding specific shapes
	const onAddCircle = () => onAddShape('circle')
	const onAddRectangle = () => onAddShape('rectangle')

	// Set up listeners for shape modifications and emit modification events
	const onModifyShape = (canvas, shape) => {
		shape.on('moving', () => {
			socket.emit('modifyShape', { id: shape.id, options: shape.toObject() })
			updateConnectedArrows(canvas, shape) // Update arrows connected to the shape
		})

		shape.on('modified', () => {
			socket.emit('modifyShape', { id: shape.id, options: shape.toObject() })
			updateConnectedArrows(canvas, shape)
		})
	}

	// Set up listeners for path modifications and emit modification events
	const onModifyPath = (path) => {
		path.on('moving', () => {
			socket.emit('modifyPath', { id: path.id, options: path.toObject() })
		})

		path.on('modified', () => {
			socket.emit('modifyPath', { id: path.id, options: path.toObject() })
		})
	}

	// Manage selection and deselection of shapes to limit to two for arrow creation
	const addShapeSelection = (shape) => {
		shape.on('selected', () => {
			setSelectedShapes((prev) => {
				const newShapes = [...prev, shape]
				if (newShapes.length > 2) newShapes.shift() // Keep only the last two selected shapes
				return newShapes
			})
		})
		shape.on('deselected', () => {
			setSelectedShapes((prev) => prev.filter((s) => s !== shape))
		})
	}

	// Add an arrow between two selected shapes and emit the event to sync with other clients
	const onAddArrow = () => {
		if (selectedShapes.length === 2) {
			const [shape1, shape2] = selectedShapes
			const lineId = generateId()
			const arrowHeadId = generateId()
			addArrow(canvas, shape1, shape2, lineId, arrowHeadId)

			socket.emit('addArrow', {
				id1: shape1.id,
				id2: shape2.id,
				lineId,
				arrowHeadId,
			})
		} else {
			alert('Please select two shapes to create an arrow!')
		}
	}

	// Create an arrow between two shapes by adding a line and an arrowhead
	const addArrow = (fabricCanvas, shape1, shape2, lineId, arrowHeadId) => {
		const shape1Center = shape1.getCenterPoint()
		const shape2Center = shape2.getCenterPoint()

		const { line, arrowHead } = createArrow(
			shape1Center.x,
			shape1Center.y,
			shape2Center.x,
			shape2Center.y,
			lineId,
			arrowHeadId
		)
		fabricCanvas.add(line, arrowHead) // Add line and arrowhead to canvas

		// Update arrow position when shapes are moved
		shape1.on('moving', () =>
			updateArrowPosition(fabricCanvas, line, arrowHead, shape1, shape2)
		)
		shape2.on('moving', () =>
			updateArrowPosition(fabricCanvas, line, arrowHead, shape1, shape2)
		)

		onArrowMove(line, arrowHead, shape1, shape2)
	}

	// Create line and triangle to form an arrow with specified start and end points
	const createArrow = (x1, y1, x2, y2, lineId, arrowHeadId) => {
		const line = new fabric.Line([x1, y1, x2, y2], {
			stroke: 'black',
			strokeWidth: 2,
			selectable: false,
			evented: false,
		})
		line.id = lineId

		const angle = Math.atan2(y2 - y1, x2 - x1)
		const arrowHead = new fabric.Triangle({
			left: x2,
			top: y2,
			originX: 'center',
			originY: 'center',
			angle: (angle * 180) / Math.PI + 90, // Rotate arrowhead to point correctly
			width: 10,
			height: 15,
			fill: 'black',
			selectable: false,
			evented: false,
		})
		arrowHead.id = arrowHeadId

		return { line, arrowHead }
	}

	// Update arrow position dynamically as connected shapes move
	const updateArrowPosition = (canvas, line, arrowHead, shape1, shape2) => {
		const shape1Center = shape1.getCenterPoint()
		const shape2Center = shape2.getCenterPoint()

		// Update line coordinates based on shape centers
		line.set({
			x1: shape1Center.x,
			y1: shape1Center.y,
			x2: shape2Center.x,
			y2: shape2Center.y,
		})

		const angle = Math.atan2(
			shape2Center.y - shape1Center.y,
			shape2Center.x - shape1Center.x
		)
		arrowHead.set({
			left: shape2Center.x,
			top: shape2Center.y,
			angle: (angle * 180) / Math.PI + 90,
		})

		line.setCoords()
		arrowHead.setCoords()
		canvas.renderAll() // Re-render to show updated arrow position
	}

	// Emit socket events to update arrows connected to a modified shape
	const updateConnectedArrows = (canvas, shape) => {
		const arrows = canvas
			.getObjects()
			.filter((obj) => obj.type === 'line' || obj.type === 'triangle')
		arrows.forEach((arrow) => {
			if (
				arrow.id &&
				(arrow.x1 === shape.left ||
					arrow.y1 === shape.top ||
					arrow.x2 === shape.left ||
					arrow.y2 === shape.top)
			) {
				socket.emit('updateArrow', {
					lineId: arrow.id,
					arrowHeadId: arrow.arrowHeadId,
					line: {
						x1: arrow.x1,
						y1: arrow.y1,
						x2: arrow.x2,
						y2: arrow.y2,
					},
					arrowHead: {
						left: arrow.left,
						top: arrow.top,
						angle: arrow.angle,
					},
				})
			}
		})
	}

	// Emit socket events to sync arrow movements with other clients
	const onArrowMove = (line, arrowHead, shape1, shape2) => {
		shape1.on('moving', () => {
			socket.emit('updateArrow', {
				lineId: line.id,
				arrowHeadId: arrowHead.id,
				line: {
					x1: line.x1,
					y1: line.y1,
					x2: line.x2,
					y2: line.y2,
				},
				arrowHead: {
					left: arrowHead.left,
					top: arrowHead.top,
					angle: arrowHead.angle,
				},
			})
		})
		shape2.on('moving', () => {
			socket.emit('updateArrow', {
				lineId: line.id,
				arrowHeadId: arrowHead.id,
				line: {
					x1: line.x1,
					y1: line.y1,
					x2: line.x2,
					y2: line.y2,
				},
				arrowHead: {
					left: arrowHead.left,
					top: arrowHead.top,
					angle: arrowHead.angle,
				},
			})
		})
	}

	// Clear canvas and emit clear event to sync with other clients
	const onClear = () => {
		canvas.clear()
		socket.emit('clear')
	}

	return (
		<div className="flex items-center justify-center w-full h-full">
			<div>
				<div className="flex gap-4 my-4">
					<button
						className={`${isDrawing ? 'underline font-bold' : ''}`}
						onClick={toggleDrawingMode}
					>
						Pen
					</button>
					<button onClick={onAddCircle}>Add Circle</button>
					<button onClick={onAddRectangle}>Add Rectangle</button>
					<button onClick={onAddArrow}>Add Arrow</button>
					<button onClick={onClear}>Clear</button>
				</div>
				<canvas className="border" width={800} height={600} ref={canvasRef} />
			</div>
		</div>
	)
}

export default App
