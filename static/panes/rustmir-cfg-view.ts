// Copyright (c) 2021, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import _ from "underscore";
import { Container } from "golden-layout";
import vis from "vis";
import { PaneCompilerState } from "./pane.interfaces";
import TomSelect from "tom-select";

export interface RustMirCfgState {
    pos: any;
    scale: any;
    selectedFn?: string;
}

export class RustMirCfg {
    compilerInfo: PaneCompilerState;
    container: Container;
    domRoot: JQuery;
    topBar: JQuery;
    eventHub: any;
    networkOpts: object;
    cfgVisualiser: any;
    defaultCfgOutput: object;
    functionPicker: TomSelect;
    cfgs: object;
    currentFunc?: string;

    constructor(hub: any, container: Container, state: RustMirCfgState & PaneCompilerState) {
        this.compilerInfo = {
            compilerId: state.compilerId,
            compilerName: state.compilerName,
            editorId: state.editorId,
        };
        this.container = container;
        this.eventHub = hub.createEventHub();
        this.domRoot = container.getElement();
        this.domRoot.html($('#rustmircfg').html());
        this.currentFunc = state.selectedFn;

        this.networkOpts = {
            autoResize: true,
            locale: 'en',
            edges: {
                arrows: { to: { enabled: true } },
                smooth: {
                    enabled: true,
                    type: 'dynamic',
                    roundness: 1,
                },
                physics: false,
                font: {
                    face: 'Consolas, "Liberation Mono", Courier, monospace',
                    strokeWidth: 0,
                    color: '#ffffff',
                },
            },
            nodes: {
                font: { face: 'Consolas, "Liberation Mono", Courier, monospace', align: 'left' },
            },
            layout: {
                hierarchical: {
                    enabled: true,
                    direction: 'UD',
                    nodeSpacing: 800,
                    levelSeparation: 150,
                },
            },
            physics: {
                enabled: false,
                hierarchicalRepulsion: {
                    nodeDistance: 160,
                },
            },
            interaction: {
                navigationButtons: false,
                keyboard: {
                    enabled: true,
                    speed: { x: 10, y: 10, zoom: 0.03 },
                    bindToWindow: false,
                },
            },
        };
        this.topBar = this.domRoot.find('.top-bar');
        this.defaultCfgOutput = { nodes: [{ id: 0, shape: 'box', label: 'No Output' }], edges: [] };

        this.cfgVisualiser = new vis.Network(this.domRoot.find('.graph-placeholder')[0],
            this.defaultCfgOutput, this.networkOpts);

        let pickerEl = this.domRoot[0].querySelector('.function-picker');
        this.functionPicker = new TomSelect(pickerEl as any, {
            sortField: 'name',
            valueField: 'name',
            labelField: 'name',
            searchField: ['name'],
            dropdownParent: 'body',
            plugins: ['input_autogrow'],
            onChange: _.bind(val => {
                var selectedFn = this.cfgs[val];
                if (selectedFn) {
                    this.currentFunc = val;
                    this.showCfgResults({
                        nodes: selectedFn.nodes,
                        edges: selectedFn.edges,
                    });
                    // this.cfgVisualiser.selectNodes([selectedFn.nodes[0].id]);
                    this.resize();
                    this.saveState();
                }
            }, this),
        } as any);

        this.initCallbacks();
        this.setTitle();
        this.eventHub.emit('rustMirCfgViewOpened', this.compilerInfo.compilerId);
    }

    initCallbacks() {
        this.cfgVisualiser.on('dragEnd', _.bind(this.saveState, this));
        this.cfgVisualiser.on('zoom', _.bind(this.saveState, this));

        this.container.on('destroy', this.close.bind(this));
        this.container.on('resize', this.resize, this);
        this.container.on('shown', this.resize, this);

        this.eventHub.on('compiler', this.onCompiler.bind(this));
        this.eventHub.on('onCompilerclose', this.onCompilerClose.bind(this));
        this.eventHub.on('compileResult', this.onCompileResult, this);
    }


    resize() {
        if (this.cfgVisualiser.canvas) {
            let height = this.domRoot.height() - this.topBar.outerHeight(true);
            this.cfgVisualiser.setSize('100%', height.toString());
            this.cfgVisualiser.redraw();
        }
    };

    getPaneName() {
        return `Rust MIR CFG Viewer ${this.compilerInfo.compilerName}` +
            `(Editor #${this.compilerInfo.editorId}, ` +
            `Compiler #${this.compilerInfo.compilerId})`;
    }

    setTitle() {
        this.container.setTitle(this.getPaneName());
    }

    onCompilerClose(compilerId: number) {
        if (this.compilerInfo.compilerId === compilerId) {
            // We can't immediately close as an outer loop somewhere in GoldenLayout is iterating over
            // the hierarchy. We can't modify while it's being iterated over.
            this.close();
            _.defer(self => {
                self.container.close();
            }, this);
        }
    }

    onCompiler(compilerId: number, compiler: any, options: any, editorId: number) {
        if (compilerId === this.compilerInfo.compilerId) {
            this.compilerInfo.compilerName = compiler ? compiler.name : '';
            this.compilerInfo.editorId = editorId;
            this.setTitle();
        }
    }

    onCompileResult(compilerId: number, compiler: any, result: any) {
        if (this.compilerInfo.compilerId === compilerId) {
            let functionNames = [];
            if (result.rustMirOutput && result.rustMirOutput.cfg) {
                this.cfgs = result.rustMirOutput.cfg;
                functionNames = _.keys(this.cfgs);
                if (functionNames.indexOf(this.currentFunc) === -1) {
                    this.currentFunc = functionNames[0];
                }
                this.showCfgResults(this.cfgs[this.currentFunc]);
            } else {
                this.showCfgResults(this.defaultCfgOutput);
            }

            this.functionPicker.clearOptions();
            this.functionPicker.addOption(functionNames.length > 0 ?
                _.map(functionNames, name => { return { name }; }) : { name: 'The input does not contain functions' }
            );
            this.functionPicker.refreshOptions(false);
            this.functionPicker.clear();
            this.functionPicker.addItem(functionNames.length ? this.currentFunc : 'The input does not contain any function', true);
            this.saveState();
        }
    }

    showCfgResults(data: any) {
        this.assignLevels(data);
        this.cfgVisualiser.setData(data);
    }

    saveState = function () {
        this.container.setState(this.currentState());
    };

    currentState() {
        return {
            compilerId: this.compilerInfo.compilerId,
            editorId: this.compilerInfo.editorId,
            selectedFn: this.currentFunc,
        };
    }

    assignLevels(data) {
        let nodes = [];
        let idToIdx = [];
        for (var i in data.nodes) {
            var node = data.nodes[i];
            idToIdx[node.id] = i;
            nodes.push({
                edges: [],
                dagEdges: [],
                index: i,
                id: node.id,
                level: 0,
                state: 0,
                inCount: 0,
            });
        }
        let isEdgeValid = edge => {
            return edge.from in idToIdx && edge.to in idToIdx;
        };
        data.edges.forEach(edge => {
            if (isEdgeValid(edge)) {
                nodes[idToIdx[edge.from]].edges.push(idToIdx[edge.to]);
            }
        });

        let dfs = node => { // choose which edges will be back-edges
            node.state = 1;
            node.edges.forEach(targetIndex => {
                var target = nodes[targetIndex];
                if (target.state !== 1) {
                    if (target.state === 0) {
                        dfs(target);
                    }
                    node.dagEdges.push(targetIndex);
                    target.inCount += 1;
                }
            });
            node.state = 2;
        };
        let markLevels = node => {
            node.dagEdges.forEach(targetIndex => {
                var target = nodes[targetIndex];
                target.level = Math.max(target.level, node.level + 1);
                if (--target.inCount === 0) {
                    markLevels(target);
                }
            });
        };
        nodes.forEach(function (node) {
            if (node.state === 0) {
                dfs(node);
                node.level = 1;
                markLevels(node);
            }
        });
        nodes.forEach(node => {
            data.nodes[node.index]['level'] = node.level;
        });
        data.edges.forEach(edge => {
            if (isEdgeValid(edge)) {
                var nodeA = nodes[idToIdx[edge.from]];
                var nodeB = nodes[idToIdx[edge.to]];
                if (nodeA.level >= nodeB.level) {
                    edge.physics = false;
                } else {
                    edge.physics = true;
                    var diff = (nodeB.level - nodeA.level);
                    edge.length = diff * (200 - 5 * (Math.min(5, diff)));
                }
            } else {
                edge.physics = false;
            }
        });
    }

    close(): void {
        this.eventHub.unsubscribe();
        this.eventHub.emit('rustMirCfgViewClosed', this.compilerInfo.compilerId);
        this.cfgVisualiser.destroy();
    }
}
