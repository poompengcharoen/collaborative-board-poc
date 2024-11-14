import * as fabric from 'fabric'

import { useEffect, useRef, useState } from 'react'

import { io } from 'socket.io-client'

const socket = io('http://localhost:4000')

const App = () => {
	const canvasRef = useRef(null)
	const [canvas, setCanvas] = useState(null)
	const [isDrawing, setIsDrawing] = useState(false)
	const [selectedShapes, setSelectedShapes] = useState([])

	useEffect(() => {
		const fabricCanvas = new fabric.Canvas(canvasRef.current)
		setCanvas(fabricCanvas)
		setupSocketListeners(fabricCanvas)

		fabricCanvas.on('path:created', (event) => {
			const newPath = event.path
			newPath.id = generateId()
			socket.emit('draw', {
				path: newPath.path,
				options: newPath.toObject(),
				id: newPath.id,
			})
			onModifyPath(newPath)
		})

		return () => {
			fabricCanvas.dispose()
			cleanupSocketListeners()
		}
	}, [])

	const setupSocketListeners = (fabricCanvas) => {
		socket.on('draw', (data) => addPathToCanvas(fabricCanvas, data))
		socket.on('modifyPath', (data) => modifyObjectOnCanvas(fabricCanvas, data))
		socket.on('addShape', (data) => addShapeToCanvas(fabricCanvas, data))
		socket.on('modifyShape', (data) => modifyObjectOnCanvas(fabricCanvas, data))
		socket.on('addArrow', (data) => addArrowToCanvas(fabricCanvas, data))
		socket.on('updateArrow', (data) => updateArrowOnCanvas(fabricCanvas, data))
		socket.on('clear', () => fabricCanvas.clear())
	}

	const cleanupSocketListeners = () => {
		socket.off('draw')
		socket.off('modifyPath')
		socket.off('addShape')
		socket.off('modifyShape')
		socket.off('addArrow')
		socket.off('updateArrow')
		socket.off('clear')
	}

	const addPathToCanvas = (fabricCanvas, { path, options, id }) => {
		const newPath = new fabric.Path(path, options)
		newPath.id = id
		fabricCanvas.add(newPath)
		onModifyPath(newPath)
	}

	const modifyObjectOnCanvas = (fabricCanvas, { id, options }) => {
		const object = fabricCanvas.getObjects().find((obj) => obj.id === id)
		if (object) {
			object.set(options).setCoords()
			fabricCanvas.renderAll()
		}
	}

	const addShapeToCanvas = (fabricCanvas, { id, type, options }) => {
		let shape
		if (type === 'circle') {
			shape = new fabric.Circle(options)
		} else if (type === 'rectangle') {
			shape = new fabric.Rect(options)
		}
		if (shape) {
			shape.id = id
			addShapeSelection(shape)
			fabricCanvas.add(shape)
			onModifyShape(fabricCanvas, shape)
		}
		return shape
	}

	const addArrowToCanvas = (
		fabricCanvas,
		{ id1, id2, lineId, arrowHeadId }
	) => {
		const shape1 = fabricCanvas.getObjects().find((obj) => obj.id === id1)
		const shape2 = fabricCanvas.getObjects().find((obj) => obj.id === id2)
		if (shape1 && shape2) {
			addArrow(fabricCanvas, shape1, shape2, lineId, arrowHeadId)
		}
	}

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
			lineObject.set(line)
			arrowHeadObject.set(arrowHead)
			lineObject.setCoords()
			arrowHeadObject.setCoords()
			fabricCanvas.renderAll()
		}
	}

	const toggleDrawingMode = () => {
		setIsDrawing(!isDrawing)
		canvas.isDrawingMode = !isDrawing
		canvas.freeDrawingBrush = new fabric.PencilBrush(canvas)
	}

	const generateId = () => '_' + Math.random().toString(36).substr(2, 9)

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

	const onAddCircle = () => onAddShape('circle')
	const onAddRectangle = () => onAddShape('rectangle')

	const onModifyShape = (canvas, shape) => {
		shape.on('moving', () => {
			socket.emit('modifyShape', { id: shape.id, options: shape.toObject() })
			updateConnectedArrows(canvas, shape)
		})

		shape.on('modified', () => {
			socket.emit('modifyShape', { id: shape.id, options: shape.toObject() })
			updateConnectedArrows(canvas, shape)
		})
	}

	const onModifyPath = (path) => {
		path.on('moving', () => {
			socket.emit('modifyPath', { id: path.id, options: path.toObject() })
		})

		path.on('modified', () => {
			socket.emit('modifyPath', { id: path.id, options: path.toObject() })
		})
	}

	const addShapeSelection = (shape) => {
		shape.on('selected', () => {
			setSelectedShapes((prev) => {
				const newShapes = [...prev, shape]
				if (newShapes.length > 2) newShapes.shift()
				return newShapes
			})
		})
		shape.on('deselected', () => {
			setSelectedShapes((prev) => prev.filter((s) => s !== shape))
		})
	}

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
		fabricCanvas.add(line, arrowHead)

		shape1.on('moving', () =>
			updateArrowPosition(fabricCanvas, line, arrowHead, shape1, shape2)
		)
		shape2.on('moving', () =>
			updateArrowPosition(fabricCanvas, line, arrowHead, shape1, shape2)
		)

		onArrowMove(line, arrowHead, shape1, shape2)
	}

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
			angle: (angle * 180) / Math.PI + 90,
			width: 10,
			height: 15,
			fill: 'black',
			selectable: false,
			evented: false,
		})
		arrowHead.id = arrowHeadId

		return { line, arrowHead }
	}

	const updateArrowPosition = (canvas, line, arrowHead, shape1, shape2) => {
		const shape1Center = shape1.getCenterPoint()
		const shape2Center = shape2.getCenterPoint()

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
		canvas.renderAll()
	}

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
