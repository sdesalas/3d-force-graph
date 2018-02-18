# 3D Force-Directed Graph

[![NPM](https://nodei.co/npm/3d-force-graph.png?compact=true)](https://nodei.co/npm/3d-force-graph/)

A web component to represent a graph data structure in a 3-dimensional space using a force-directed iterative layout.
Uses [ThreeJS](https://github.com/mrdoob/three.js/)/WebGL for 3D rendering and either [d3-force-3d](https://github.com/vasturiano/d3-force-3d) or [anvaka](https://github.com/anvaka)'s [ngraph](https://github.com/anvaka/ngraph.forcelayout3d) for the underlying physics engine.

## Quick start

```
import ForceGraph3D from '3d-force-graph';
```
or
```
var ForceGraph3D = require('3d-force-graph');
```
or even
```
<script src="//unpkg.com/3d-force-graph/dist/3d-force-graph.min.js"></script>
```
then
```
var myGraph = ForceGraph3D(myDOMElement, { width: 500, lineOpacity: 0.5 });
```

## API reference

| Option | Description | Default |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------- |
| <b>width</b>([<i>px</i>]) | Canvas width | &lt;window width&gt; |
| <b>height</b>([<i>px</i>]) | Canvas height | &lt;window height&gt; |
| <b>graphData</b>([<i>data</i>]) | Graph data structure (see below for syntax details) | { nodes: [], links: [] } |
| <b>jsonUrl</b>([<i>url</i>]) | URL of JSON file to load graph data directly from, as an alternative to specifying <i>graphData</i> directly ||
| <b>numDimensions</b>([<i>int</i>]) | Number of dimensions to run the force simulation on (1, 2 or 3) | 3 |
| <b>nodeRelSize</b>([<i>num</i>]) | Ratio of node sphere volume (cubic px) per value unit | 4 |
| <b>lineOpacity</b>([<i>num</i>]) | Line opacity of links, between [0,1] | 0.2 |
| <b>autoColorBy</b>([<i>str</i>]) | Node object accessor attribute to automatically group colors by, only affects nodes without a color attribute ||
| <b>idField</b>([<i>str</i>]) | Node object accessor attribute for unique node id (used in link objects source/target) | id |
| <b>valField</b>([<i>str</i>]) | Node object accessor attribute for node numeric value (affects sphere volume) | val |
| <b>nameField</b>([<i>str</i>]) | Node object accessor attribute for name (shown in label) | name |
| <b>colorField</b>([<i>str</i>]) | Node object accessor attribute for node color (affects sphere color) | color |
| <b>linkSourceField</b>([<i>str</i>]) | Link object accessor attribute referring to id of source node | source |
| <b>linkTargetField</b>([<i>str</i>]) | Link object accessor attribute referring to id of target node | target |
| <b>forceEngine</b>([<i>str</i>]) | Force-simulation engine to use ([*d3*](https://github.com/vasturiano/d3-force-3d) or [*ngraph*](https://github.com/anvaka/ngraph.forcelayout)) | d3 |
| <b>warmupTicks</b>([<i>int</i>]) | Number of layout engine cycles to dry-run at ignition before starting to render | 0 |
| <b>cooldownTicks</b>([<i>int</i>]) | How many build-in frames to render before stopping and freezing the layout engine | Infinity |
| <b>cooldownTime</b>([<i>num</i>]) | How long (ms) to render for before stopping and freezing the layout engine | 15000 |
| <b>resetProps() | Reset all component properties to their default value ||

### Input JSON syntax

```
{
    "nodes": [ 
        { 
          "id": "id1",
          "name": "name1",
          "val": 1 
        },
        { 
          "id": "id2",
          "name": "name2",
          "val": 10 
        },
        (...)
    ],
    "links": [
        {
            "source": "id1",
            "target": "id2"
        },
        (...)
    ]
}
```

## Local development

```
npm install
npm run watch
```
