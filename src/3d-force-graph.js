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
	nodeRelSize: 8, // volume per val unit
	lineOpacity: 0.2,
	lineColor: 0xccfffb,
	lineColorNeg: 0xff7575,
	sphereOpacity: 1,
	sphereColor: 0x5a6d6c,
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
	forceEngine: 'd3', // d3 or ngraph
	warmupTicks: 0, // how many times to tick the force engine at init before starting to render
	cooldownTicks: Infinity,
	cooldownTime: 15000, // ms
	onMouseOver: undefined, // mouse over an object
	onClick: undefined, // click on an object
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
			if (this.onClick) {
				const intersect = this.mousePos.intersect;
				if (intersect && intersect.object && intersect.object instanceof THREE.Mesh) {
					var node = this.graphData.nodes.find(n => intersect.object === n.__sphere);
					this.onClick.call(this, node.id, node, intersect);
				}
				this.onClick.call(this, intersect);
			}
		});

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

		const sprite = new THREE.TextureLoader().load( "/static/disc.png" );
		const highlightMaterial = new THREE.PointsMaterial( { color: 0xffffff, map: sprite, size: this.nodeRelSize * 1.5, blending: THREE.AdditiveBlending, depthTest: false, transparent : true } );

		this.graphData.nodes.forEach(node => {

			const color = node[this.colorField] || this.sphereColor;
			const opacity = this.sphereOpacity;
			const size = Math.cbrt(node[this.valField] || 1) * this.nodeRelSize;
			const geometry = new THREE.Geometry();
			const material = new THREE.PointsMaterial( { color: color, size: size, opacity: opacity, map: sprite, blending: THREE.AdditiveBlending, depthTest: false, transparent : true } );			

			geometry.vertices.push( new THREE.Vector3() );

			const sphere = new THREE.Points( geometry, material );

			sphere.name = node[this.nameField]; // Add label

			// Add function that can highlight the node for a specific duration in milliseconds
			node[this.highlightField] = function(duration) {
				sphere.material = highlightMaterial;
				setTimeout(() => sphere.material = material, duration);
			}

			this.graphScene.add(node.__sphere = sphere);

		});


		//const sphereMaterial = new THREE.MeshLambertMaterial({ color: this.sphereColor, transparent: true, opacity: this.sphereOpacity });
/*
		this.graphData.nodes.forEach(node => {
			const color = node[this.colorField] || this.sphereColor;
			const opacity = this.sphereOpacity;
			const material = new THREE.MeshLambertMaterial({ color: color, transparent: true, opacity: opacity });
			const sphere = new THREE.Mesh(
				new THREE.SphereGeometry(Math.cbrt(node[this.valField] || 1) * this.nodeRelSize, 3, 4),
				material
			);

			sphere.name = node[this.nameField]; // Add label
			// Add function that can highlight the node for a specific duration in milliseconds
			sphere[this.highlightField] = function(duration) {
				sphere.material = highlightMaterial;
				setTimeout(() => sphere.material = material, duration);
			}

			this.graphScene.add(node.__sphere = sphere);
		});
*/
		//const lineMaterial = new THREE.LineBasicMaterial({ color: this.lineColor, transparent: true, opacity: this.lineOpacity });
		const arrowMaterial = new THREE.MeshLambertMaterial({ color: this.lineColor, transparent: true, opacity: this.lineOpacity });
		
		this.graphData.links.forEach(link => {
			const geometry = new THREE.BufferGeometry();
			const opacity = link.opacity || this.lineOpacity;
			const color = opacity > 0 ? this.lineColor : this.lineColorNeg;
			geometry.addAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * 3), 3));

			const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: Math.abs(opacity * 0.5) }));

			line.renderOrder = 10; // Prevent visual glitches of dark lines on top of spheres by rendering them last
			line.visible = Math.abs(opacity) > 0.2; // Hide if opacity is less than 8%

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
