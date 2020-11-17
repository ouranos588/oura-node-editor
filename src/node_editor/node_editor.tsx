import React, { Component } from "react";
import { produce, enableMapSet } from "immer";
import _ from "lodash";

import {
    XYPosition,
    LinkModel,
    LinkPositionModel,
    arePositionEquals,
    PanZoomModel,
    ConnectorModel,
    NodeCollection,
    LinkCollection,
    SelectionItem,
    PinSide,
    NodePinPositions,
    PinPosition
} from "./model";
import { Node } from "./node";
import PanZoom from "./pan_zoom";
import createLinkComponent from "./links";
import { KeyPressedWrapper } from "./events_wrappers";

enableMapSet();

type NodeEditorProps = {
    nodes: NodeCollection;
    links: LinkCollection;
    panZoomInfo: PanZoomModel;
    selectedItems: Array<SelectionItem>;

    onNodeMove(id: string, offsetX: number, offsetY: number, offsetWidth: number): void;
    onCreateLink(link: LinkModel): void;
    onConnectorUpdate?: (nodeId: string, cId: string, connector: ConnectorModel) => void;

    onPanZoomInfo: (panZoomInfo: PanZoomModel) => void;
    onSelectedItems: (selection: Array<SelectionItem>) => void;
};

type NodeEditorState = {
    linksPositions: { [linkId: string]: LinkPositionModel };
    draggedLink?: LinkPositionModel;
};

class NodeEditor extends Component<NodeEditorProps, NodeEditorState> {
    private keyPressedWrapper: KeyPressedWrapper;
    private nodesPinPositions: { [nodeId: string]: NodePinPositions } = {};
    private redrawPinPosition = false;
    private lastSettedSelection: SelectionItem | null = null;

    constructor(props: NodeEditorProps) {
        super(props);
        this.state = {
            linksPositions: {}
        };

        this.getZoom = this.getZoom.bind(this);

        this.onNodeMoveStart = this.onNodeMoveStart.bind(this);
        this.onNodeMove = this.onNodeMove.bind(this);
        this.onNodeMoveEnd = this.onNodeMoveEnd.bind(this);

        this.onUpdatePreviewLink = this.onUpdatePreviewLink.bind(this);
        this.onCreateLink = this.onCreateLink.bind(this);
        this.onConnectorUpdate = this.onConnectorUpdate.bind(this);

        this.onSelectLink = this.onSelectLink.bind(this);

        this.onNodePinPositionsUpdate = this.onNodePinPositionsUpdate.bind(this);

        this.onSelectItem = this.onSelectItem.bind(this);

        this.keyPressedWrapper = new KeyPressedWrapper();
    }

    componentDidMount(): void {
        this.keyPressedWrapper.attachListeners();
        const newLinksPositions = this.updateLinkPositions();
        if (this.redrawPinPosition) {
            this.redrawPinPosition = false;
            this.setState({
                linksPositions: newLinksPositions
            });
        }
    }

    componentDidUpdate(): void {
        const newLinksPositions = this.updateLinkPositions();
        if (this.redrawPinPosition) {
            this.redrawPinPosition = false;
            // eslint-disable-next-line react/no-did-update-set-state
            this.setState({
                linksPositions: newLinksPositions
            });
        }
    }

    componentWillUnmount(): void {
        this.keyPressedWrapper.detachListeners();
    }

    onNodeMoveStart(id: string): void {
        this.onSelectItem({ id, type: "node" });
    }

    onSelectItem(selection: SelectionItem | null): void {
        const { selectedItems, onSelectedItems } = this.props;
        if (!selection && !this.keyPressedWrapper.isKeyDown("shift")) {
            onSelectedItems([]);
        } else if (selection && !_.some(selectedItems, selection)) {
            let newSelection = [...selectedItems];
            if (!this.keyPressedWrapper.isKeyDown("shift")) {
                newSelection = [];
            }
            newSelection.push(selection);
            this.lastSettedSelection = selection;
            onSelectedItems(newSelection);
        }
    }

    onNodeMove(offsetX: number, offsetY: number, offsetWidth: number): void {
        const { selectedItems } = this.props;

        // Move each selected node
        selectedItems.forEach((item) => {
            if (item.type === "node") {
                const { nodes, onNodeMove } = this.props;
                const newX = nodes[item.id].x + offsetX;
                const newY = nodes[item.id].y + offsetY;
                const newWidth = nodes[item.id].width + offsetWidth;
                onNodeMove(item.id, newX, newY, newWidth > 100 ? newWidth : 100);
            }
        });
    }

    onNodeMoveEnd(id: string, wasNodeMoved: boolean): void {
        const { selectedItems, onSelectedItems } = this.props;
        const selection = { id, type: "node" };
        if (!wasNodeMoved && !this.keyPressedWrapper.isKeyDown("shift")) {
            onSelectedItems([selection]);
        } else if (
            !wasNodeMoved &&
            this.keyPressedWrapper.isKeyDown("shift") &&
            !_.isEqual(selection, this.lastSettedSelection)
        ) {
            let indexToDelete = -1;
            selectedItems.forEach((item, index) => {
                if (item.id === id && item.type === "node") {
                    indexToDelete = index;
                }
            });
            if (indexToDelete !== -1) {
                const newSelection = [...selectedItems];
                newSelection.splice(indexToDelete, 1);
                onSelectedItems(newSelection);
            }
        }
        this.lastSettedSelection = null;
    }

    onUpdatePreviewLink(inputPinPos: PinPosition, outputPinPos: PinPosition): void {
        if (inputPinPos === null || outputPinPos === null) {
            this.setState({
                draggedLink: undefined
            });
        } else {
            this.setState({
                draggedLink: {
                    linkId: "preview",
                    inputPinPosition: inputPinPos,
                    outputPinPosition: outputPinPos
                }
            });
        }
    }

    onCreateLink(link: LinkModel): void {
        const { onCreateLink } = this.props;
        if (link.inputPinSide === link.outputPinSide || link.inputNodeId === link.outputNodeId) {
            return;
        }
        onCreateLink(link);
    }

    onConnectorUpdate(nodeId: string, cId: string, connector: ConnectorModel): void {
        const { onConnectorUpdate } = this.props;
        if (onConnectorUpdate) {
            onConnectorUpdate(nodeId, cId, connector);
        }
    }

    onSelectLink(id: string): void {
        this.onSelectItem({ id, type: "link" });
    }

    onNodePinPositionsUpdate(nodeId: string, pinPositions: NodePinPositions): void {
        this.nodesPinPositions[nodeId] = pinPositions;
    }

    getZoom(): number {
        const { panZoomInfo } = this.props;
        return panZoomInfo.zoom;
    }

    updateLinkPositions(): { [linkId: string]: LinkPositionModel } {
        const { links } = this.props;
        const { linksPositions } = this.state;
        const newLinksPositions = produce(linksPositions, (draft) => {
            // Create or update position of all links positions that need so
            Object.keys(links).forEach((key) => {
                const link = links[key];
                if (
                    !(
                        link.inputNodeId in this.nodesPinPositions &&
                        link.outputNodeId in this.nodesPinPositions
                    )
                ) {
                    return;
                }
                const inputNodePins = this.nodesPinPositions[link.inputNodeId][link.inputPinId];
                const outputNodePins = this.nodesPinPositions[link.outputNodeId][link.outputPinId];
                if (inputNodePins && outputNodePins) {
                    const inputPinPosition: XYPosition | null =
                        inputNodePins[link.inputPinSide === PinSide.LEFT ? 0 : 1];
                    const outputPinPosition: XYPosition | null =
                        outputNodePins[link.outputPinSide === PinSide.LEFT ? 0 : 1];
                    if (inputPinPosition && outputPinPosition) {
                        if (
                            !(key in draft) ||
                            !arePositionEquals(draft[key].inputPinPosition, inputPinPosition) ||
                            !arePositionEquals(draft[key].outputPinPosition, outputPinPosition)
                        ) {
                            draft[key] = { linkId: key, inputPinPosition, outputPinPosition };
                            this.redrawPinPosition = true;
                        }
                    }
                }
            });
            // Remove link positions that belongs to a deleted links
            Object.keys(linksPositions).forEach((key) => {
                if (!(key in links)) {
                    delete draft[key];
                    this.redrawPinPosition = true;
                }
            });
        });
        return newLinksPositions;
    }

    render(): JSX.Element {
        const { nodes, links, selectedItems, panZoomInfo, onPanZoomInfo } = this.props;
        const { draggedLink, linksPositions } = this.state;
        let svgDraggedLink;
        if (draggedLink) {
            svgDraggedLink = createLinkComponent({
                linkType: "bezier",
                linkPosition: draggedLink,
                isLinkSelected: false
            });
        }

        const svgLinks: JSX.Element[] = [];
        Object.keys(links).forEach((key) => {
            const linkPosition = linksPositions[key];
            if (linkPosition) {
                svgLinks.push(
                    createLinkComponent({
                        linkId: key,
                        linkType: links[key].linkType,
                        key,
                        linkPosition,
                        isLinkSelected: _.some(selectedItems, { id: key, type: "link" }),
                        onSelectLink: this.onSelectLink
                    })
                );
            }
        });
        const grid = String(200 * panZoomInfo.zoom);
        return (
            <div
                style={{
                    position: "relative",
                    top: "0",
                    left: "0",
                    width: "100%",
                    height: "100%",
                    overflow: "hidden",
                    backgroundColor: "#232323",
                    backgroundPosition: `${panZoomInfo.topLeftCorner.x}px ${panZoomInfo.topLeftCorner.y}px`,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${grid}' height='${grid}' viewBox='0 0 100 100'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='black' fill-opacity='0.4'%3E%3Cpath opacity='.5' d='M96 95h4v1h-4v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4h-9v4h-1v-4H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15v-9H0v-1h15V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h9V0h1v15h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9h4v1h-4v9zm-1 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm9-10v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-10 0v-9h-9v9h9zm-9-10h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9zm10 0h9v-9h-9v9z'/%3E%3Cpath d='M6 5V0H5v5H0v1h5v94h1V6h94V5H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`
                }}>
                <PanZoom
                    panZoomInfo={panZoomInfo}
                    onPanZoomInfo={onPanZoomInfo}
                    onSelectItem={this.onSelectItem}>
                    <svg
                        style={{
                            position: "absolute",
                            top: "0",
                            left: "0",
                            width: "100%",
                            height: "100%",
                            overflow: "visible"
                        }}>
                        {svgLinks}
                        {svgDraggedLink}
                    </svg>
                    {Object.keys(nodes).map((key) => (
                        <Node
                            nodeId={key}
                            key={key}
                            node={nodes[key]}
                            isNodeSelected={_.some(selectedItems, { id: key, type: "node" })}
                            getZoom={this.getZoom}
                            onNodeMoveStart={this.onNodeMoveStart}
                            onNodeMove={this.onNodeMove}
                            onNodeMoveEnd={this.onNodeMoveEnd}
                            onCreateLink={this.onCreateLink}
                            onUpdatePreviewLink={this.onUpdatePreviewLink}
                            onConnectorUpdate={this.onConnectorUpdate}
                            onNodePinPositionsUpdate={this.onNodePinPositionsUpdate}
                        />
                    ))}
                </PanZoom>
            </div>
        );
    }
}

export default NodeEditor;
