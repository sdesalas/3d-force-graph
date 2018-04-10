import './3d-force-graph.css';

import './threeGlobal';
import 'three/examples/js/controls/TrackBallControls';

import * as d3 from 'd3-force-3d';
import graph from 'ngraph.graph';
import forcelayout from 'ngraph.forcelayout';
import forcelayout3d from 'ngraph.forcelayout3d';
const ngraph = { graph, forcelayout, forcelayout3d };

const CAMERA_DISTANCE2NODES_FACTOR = 150;

const defaults = {
	width: window.innerWidth,
	height: window.innerHeight,
	jsonUrl: undefined,
	graphData: {
		nodes: [],
		links: []
	},
	numDimensions: 3,
	nodeRelSize: 4, // volume per val unit
	lineOpacity: 0.3,
	lineColor: 0x566c6a,
	lineColorNeg: 0xff8585,
	sphereOpacity: 1,
	sphereColor: 0x566c6a,
	autoColorBy: undefined,
	includeArrows: false,
	highlightItems: false,
	idField: 'id',
	valField: 'val',
	nameField: 'name',
	colorField: 'color',
	highlightField: 'highlight',
	linkSourceField: 'source',
	linkTargetField: 'target',
	linkOpacityField: 'opacity',
	forceEngine: 'ngraph', // d3 or ngraph
	warmupTicks: 0, // how many times to tick the force engine at init before starting to render
	cooldownTicks: Infinity,
	cooldownTime: 15000, // ms
	onMouseOver: undefined, // mouse over an object
	onClick: undefined, // click on an object
	onDblClick: undefined, // double-click on an object
	onReady: undefined // initialised 
};

export default class ForceGraph3D {

	constructor (domNode, opts) {

		// Apply options and defaults
		Object.assign(this, defaults, opts);

		// Wipe DOM
		domNode.innerHTML = '';

		// Add info space
		domNode.appendChild(this.infoElem = document.createElement('div'));
		this.infoElem.className = 'graph-info-msg';
		this.infoElem.textContent = '';

		// Setup tooltip
		this.toolTipElem = document.createElement('div');
		this.toolTipElem.classList.add('graph-tooltip');
		domNode.appendChild(this.toolTipElem);

		// Capture mouse coords on move
		const raycaster = new THREE.Raycaster();
		this.mousePos = new THREE.Vector2();
		this.mousePos.x = -2; // Initialize off canvas
		this.mousePos.y = -2;
		domNode.addEventListener("mousemove", ev => {
			// update the mouse pos
			const offset = getOffset(domNode),
				relPos = {
					x: ev.pageX - offset.left,
					y: ev.pageY - offset.top
				};
			this.mousePos.x = (relPos.x / this.width) * 2 - 1;
			this.mousePos.y = -(relPos.y / this.height) * 2 + 1;

			// Capture active object
			raycaster.setFromCamera(this.mousePos, this.camera);
			this.mousePos.intersect = raycaster.intersectObjects(this.graphScene.children)
				.filter(o => o.object) // Check only objects with labels
				.shift(); // first item

			// Move tooltip
			this.toolTipElem.style.top = (relPos.y - 15) + 'px';
			this.toolTipElem.style.left = (relPos.x + 15) + 'px';

			if (this.highlightItems) {
				this.resetOpacity();
				if (this.mousePos.intersect) {
					this.mousePos.intersect.object.material.opacity = 0.9;
					domNode.style.cursor = 'pointer';
				} else {
					domNode.style.cursor = 'default';
				}
			}

			if (this.onMouseOver) {
				this.onMouseOver.call(this, this.mousePos.intersect);
			}

			function getOffset(el) {
				const rect = el.getBoundingClientRect(),
					scrollLeft = window.pageXOffset || document.documentElement.scrollLeft,
					scrollTop = window.pageYOffset || document.documentElement.scrollTop;
				return { top: rect.top + scrollTop, left: rect.left + scrollLeft };
			}
		}, false);

		domNode.addEventListener("click", ev => {
			if (ev.originalEvent && ev.originalEvent.detail > 1) return; // avoid firing on quick successing (dbl click)
			if (this.onClick) {
				const intersect = this.mousePos.intersect, 
					node = this.findNode(intersect), 
					link = this.findLink(intersect);
				if (node) {
					this.onClick.call(this, 'node', node, intersect);
				} else if (link) {
					this.onClick.call(this, 'link', link, intersect);
				} else {
					this.onClick.call(this, 'object', intersect);
				}
			}
		});

		domNode.addEventListener("dblclick", ev => {
			if (this.onDblClick) {
				const intersect = this.mousePos.intersect, 
					node = this.findNode(intersect), 
					link = this.findLink(intersect);
				if (node) {
					this.onDblClick.call(this, 'node', node, intersect);
				} else if (link) {
					this.onDblClick.call(this, 'link', link, intersect);
				} else {
					this.onDblClick.call(this, 'object', intersect);
				}
			}
		});

		domNode.addEventListener("contextmenu", ev => {
			if (this.onRightClick) {
				const intersect = this.mousePos.intersect, 
					node = this.findNode(intersect), 
					link = this.findLink(intersect);
				if (node) {
					this.onRightClick.call(this, 'node', node, intersect);
				} else if (link) {
					this.onRightClick.call(this, 'link', link, intersect);
				} else {
					this.onRightClick.call(this, 'object', intersect);
				}
			}
		})

		// Setup renderer
		this.renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
		domNode.appendChild(this.renderer.domElement);

		// Setup scene
		this.scene = new THREE.Scene();
		this.scene.fog = new THREE.FogExp2( 0x0000A, 0.0005 );
		this.scene.background = new THREE.Color(0x0000A);
		this.scene.add(this.graphScene = new THREE.Group());

		// Add lights
		//this.scene.add(new THREE.AmbientLight(0xbbbbbb));
		//this.scene.add(new THREE.DirectionalLight(0xffffff, 0.6));

		// Setup camera
		this.camera = new THREE.PerspectiveCamera();
		this.camera.far = 20000;

		// Add camera interaction
		this.tbControls = new THREE.TrackballControls(this.camera, this.renderer.domElement);

		// Add D3 force-directed layout
		this.d3ForceLayout = d3.forceSimulation()
			.force('link', d3.forceLink())
			.force('charge', d3.forceManyBody())
			.force('center', d3.forceCenter())
			.stop();

		// Kick-off renderer
		this.animate();

		// Kick off
		this.update();
	}

	animate() { // IIFE
		if(this.onFrame) this.onFrame();

		// Update tooltip
		this.toolTipElem.textContent = this.mousePos.intersect ?
										this.mousePos.intersect.object.name : '';

		// Frame cycle
		this.tbControls.update();
		this.renderer.render(this.scene, this.camera);
		requestAnimationFrame(() => this.animate());
	}

	resetOpacity() {
		this.graphScene.children.forEach(child => {
			if (child) {
				if (child.type === 'Mesh' && child.geometry instanceof THREE.SphereGeometry) {
					child.material.opacity = this.sphereOpacity;
				} else if (child.type === 'Line') {
					child.material.opacity = this.lineOpacity;
				}
			}
		});
	}

	update() {

		this.resizeCanvas();

		this.onFrame = null; // Pause simulation
		this.infoElem.textContent = 'Loading...';

		if (this.graphData.nodes.length || this.graphData.links.length) {
			console.info('3d-force-graph loading', this.graphData.nodes.length + ' nodes', this.graphData.links.length + ' links');
		}

		if (!this.fetchingJson && this.jsonUrl && !this.graphData.nodes.length && !this.graphData.links.length) {
			// (Re-)load data
			this.fetchingJson = true;
			qwest.get(this.jsonUrl).then((_, json) => {
				this.fetchingJson = false;
				this.graphData = json;
				this.update();  // Force re-update
			});
		}

		// Auto add color to uncolored nodes
		this.autoColorNodes(this.graphData.nodes, this.autoColorBy, this.colorField);

		// parse links
		this.graphData.links.forEach(link => {
			link.source = link[this.linkSourceField];
			link.target = link[this.linkTargetField];
			link.opacity = link[this.linkOpacityField];
		});

		// Add WebGL objects
		while (this.graphScene.children.length) { this.graphScene.remove(this.graphScene.children[0]) } // Clear the place

		const sprite = new THREE.TextureLoader().load( "data:image/png;base64,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" );
		const highlightMaterial = new THREE.SpriteMaterial( { color: 0xffffff, map: sprite, depthTest: false, transparent : true } );

		this.graphData.nodes.forEach(node => {

			const color = node[this.colorField] || this.sphereColor;
			const opacity = this.sphereOpacity;
			const size = Math.cbrt(node[this.valField] || 1) * this.nodeRelSize;
			const geometry = new THREE.Geometry();
			const material = new THREE.SpriteMaterial( { color: color, opacity: opacity, map: sprite, depthTest: false, transparent : true } );
			const sphere = new THREE.Sprite( material );
			sphere.scale.set(size, size, 1);

			sphere.name = node[this.nameField]; // Add label

			// Add function that can highlight the node for a specific duration in milliseconds
			sphere[this.highlightField] = node[this.highlightField] = function(duration) {
				sphere.material = highlightMaterial;
				setTimeout(() => sphere.material = material, duration);
			}

			this.graphScene.add(node.__sphere = sphere);

		});

		//const lineMaterial = new THREE.LineBasicMaterial({ color: this.lineColor, transparent: true, opacity: this.lineOpacity });
		const arrowMaterial = new THREE.MeshLambertMaterial({ color: this.lineColor, transparent: true, opacity: this.lineOpacity });
		
		this.graphData.links.forEach(link => {
			const geometry = new THREE.BufferGeometry();
			const opacity = link.opacity || this.lineOpacity;
			const color = opacity > 0 ? this.lineColor : this.lineColorNeg;
			geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));

			const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: Math.pow(opacity, 2) }));

			line.renderOrder = 10; // Prevent visual glitches of dark lines on top of spheres by rendering them last
			line.visible = Math.abs(opacity) > 0.20; // Hide if opacity is less than 20%

			if (this.includeArrows) {
				const arrow = new THREE.ArrowHelper(new THREE.Vector3(), new THREE.Vector3(), 0, this.lineColor);
				arrow.cone.material = arrowMaterial;
				//arrow.line.material = lineMaterial;
				this.graphScene.add(link.__arrow = arrow);
			}

			this.graphScene.add(link.__line = line);

		});

		this.camera.lookAt(this.graphScene.position);
		this.camera.position.z = Math.cbrt(this.graphData.nodes.length) * CAMERA_DISTANCE2NODES_FACTOR;

		// Feed data to force-directed layout
		const isD3Sim = this.forceEngine !== 'ngraph';
		if (isD3Sim) {
			// D3-force
			(this.layout = this.d3ForceLayout)
				.stop()
				.alpha(1)// re-heat the simulation
				.numDimensions(this.numDimensions)
				.nodes(this.graphData.nodes)
				.force('link')
					.id(d => d[this.idField])
					.links(this.graphData.links);
		} else {
			// ngraph
			const graph = ngraph.graph();
			this.graphData.nodes.forEach(node => { graph.addNode(node[this.idField]); });
			this.graphData.links.forEach(link => { graph.addLink(link.source, link.target); });
			this.layout = ngraph['forcelayout' + (this.numDimensions === 2 ? '' : '3d')](graph);
			this.layout.graph = graph; // Attach graph reference to layout
		}

		for (let i=0; i<this.warmupTicks; i++) { 
			this.layout[isD3Sim?'tick':'step'](); // Initial ticks before starting to render
		} 

		this.layoutTickCount = 0;
		this.layoutStartTickTime = new Date();
		this.onFrame = () => this.layoutTick();
		this.infoElem.textContent = '';

		// Ready
		if (this.onReady) {
			this.onReady(this);
		}
	}

	resizeCanvas() {
		if (this.width && this.height) {
			this.renderer.setSize(this.width, this.height);
			this.camera.aspect = this.width/this.height;
			this.camera.updateProjectionMatrix();
		}
	}

	findNode(intersect) {
		if (intersect && intersect.object && intersect.object instanceof THREE.Sprite) {
			return this.graphData.nodes.find(n => intersect.object === n.__sphere);
		}
		return undefined;
	}

	findLink(intersect) {
		if (intersect && intersect.object && intersect.object instanceof THREE.Line) {
			return this.graphData.links.find(l => intersect.object === l.__line);
		}
		return undefined;
	}

	layoutTick() {

		const layout = this.layout;
		const isD3Sim = this.forceEngine !== 'ngraph';
		if (this.layoutTickCount++ > this.cooldownTicks || (new Date()) - this.layoutStartTickTime > this.cooldownTime) {
			this.onFrame = null; // Stop ticking graph
		}

		layout[isD3Sim?'tick':'step'](); // Tick it

		// Update nodes position
		this.graphData.nodes.forEach(node => {
			const sphere = node.__sphere,
				pos = isD3Sim ? node : layout.getNodePosition(node[this.idField]);

			sphere.position.x = pos.x;
			sphere.position.y = pos.y || 0;
			sphere.position.z = pos.z || 0;
		});

		// Update links position
		this.graphData.links.forEach(link => {
			const line = link.__line,
				arrow = link.__arrow,
				pos = isD3Sim
					? link
					: layout.getLinkPosition(layout.graph.getLink(link.source, link.target).id);
			let start = pos[isD3Sim ? 'source' : 'from'];
			let end = pos[isD3Sim ? 'target' : 'to'];
			let linePos = line.geometry.attributes.position;

			linePos.array[0] = start.x;
			linePos.array[1] = start.y || 0;
			linePos.array[2] = start.z || 0;
			linePos.array[3] = end.x;
			linePos.array[4] = end.y || 0;
			linePos.array[5] = end.z || 0;
			linePos.needsUpdate = true;
			line.geometry.computeBoundingSphere();

			if (arrow) {
				start.y = start.y || 0;
				start.z = start.z || 0;
				end.y = end.y || 0;
				end.z = end.z || 0;
				let boundingSphere = line.geometry.boundingSphere;
				//arrow.position.copy(end);
				arrow.position.copy(boundingSphere.center)

				arrow.setDirection(new THREE.Vector3(0,0,0).copy(end).sub(start).normalize());
				arrow.setLength(0, 4, 2);
			}

		});
	}

	autoColorNodes(nodes, colorBy, colorField) {
		if (!colorBy) return;

		// Color brewer paired set
		const colors = ['#a6cee3','#1f78b4','#b2df8a','#33a02c','#fb9a99','#e31a1c','#fdbf6f','#ff7f00','#cab2d6','#6a3d9a','#ffff99','#b15928'];

		const uncoloredNodes = nodes.filter(node => !node[colorField]),
			nodeGroups = {};

		uncoloredNodes.forEach(node => { nodeGroups[node[colorBy]] = null });
		Object.keys(nodeGroups).forEach((group, idx) => { nodeGroups[group] = idx });

		uncoloredNodes.forEach(node => {
			node[colorField] = parseInt(colors[nodeGroups[node[colorBy]] % colors.length].slice(1), 16);
		});
	}
}
