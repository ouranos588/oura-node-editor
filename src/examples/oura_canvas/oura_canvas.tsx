/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { produce } from "immer";
import _ from "lodash";

import {
    NodeEditor,
    LinkModel,
    PanZoomModel,
    generateUuid,
    ConnectorModel,
    NodeCollection,
    LinkCollection,
    NodeModel
} from "../../node_editor";
import { createNodeSchema, Node } from "./nodes";
import CanvasNode from "./nodes/canvas";
import { AddNodeContextualMenu } from "../../contextual_menu";
import { SelectionItem, XYPosition } from "../../node_editor/model";

const OuraCanvasApp = (): JSX.Element => {
    const [nodePickerPos, setNodePickerPos] = React.useState<XYPosition | null>(null);
    const [keysDown, setKeysDown] = React.useState<Set<string>>(new Set());
    const [panZoomInfo, setPanZoomInfo] = React.useState<PanZoomModel>({
        zoom: 1,
        topLeftCorner: { x: 0, y: 0 }
    });
    const [selectedItems, setSelectedItems] = React.useState<SelectionItem[]>([]);
    const [nodes, setNodes] = React.useState<NodeCollection>({});
    const [links, setLinks] = React.useState<LinkCollection>({});
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    const nodesSchemas: { [nId: string]: NodeModel } = createNodeSchema(canvasRef);

    const redrawCanvas = React.useCallback((curNodes: NodeCollection, curLink: LinkCollection) => {
        Object.keys(curNodes).forEach((key) => {
            const node = curNodes[key];
            if (node instanceof CanvasNode) {
                (node as Node).compute(curNodes, curLink);
            }
        });
    }, []);

    const onNodeMove = React.useCallback(
        (id: string, newX: number, newY: number, newWidth: number) => {
            const newNodes = produce(nodes, (draft: NodeCollection) => {
                draft[id].x = newX;
                draft[id].y = newY;
                draft[id].width = newWidth;
            });
            setNodes(newNodes);
        },
        [nodes]
    );

    const onCreateLink = React.useCallback(
        (link: LinkModel) => {
            const newLinks = produce(links, (draft) => {
                draft[generateUuid()] = link;
            });
            setLinks(newLinks);
            redrawCanvas(nodes, newLinks);
        },
        [nodes, links]
    );

    const onNodeDeletion = React.useCallback(
        (id: string) => {
            const newNodes = { ...nodes };
            delete newNodes[id];
            const newLinks = produce(links, (draft: LinkCollection) => {
                Object.keys(links).forEach((key) => {
                    const link = links[key];
                    if (link.inputNodeId === id || link.outputNodeId === id) {
                        delete draft[key];
                    }
                });
            });
            setNodes(newNodes);
            setLinks(newLinks);
            redrawCanvas(newNodes, newLinks);
        },
        [nodes, links]
    );

    const onLinkDeletion = React.useCallback(
        (id: string) => {
            const newLinks = { ...links };
            delete newLinks[id];
            setLinks(newLinks);
            redrawCanvas(nodes, newLinks);
        },
        [nodes, links]
    );

    const onKeyDown = React.useCallback(
        (event: React.KeyboardEvent) => {
            const newKeys = produce(keysDown, (draft) => {
                draft.add(event.key.toLowerCase());
            });
            setKeysDown(newKeys);
            if (newKeys.has("escape") && nodePickerPos) {
                setNodePickerPos(null);
            }
        },
        [keysDown, nodePickerPos]
    );

    const onKeyUp = React.useCallback(
        (event: React.KeyboardEvent) => {
            const newKeys = produce(keysDown, (draft) => {
                draft.delete(event.key.toLowerCase());
            });
            setKeysDown(newKeys);
        },
        [keysDown]
    );

    const onNodeSelection = React.useCallback(
        (id: string) => {
            if (nodePickerPos) {
                const newNode = _.clone(nodesSchemas[id]);
                newNode.x = panZoomInfo.topLeftCorner.x + nodePickerPos.x;
                newNode.y = panZoomInfo.topLeftCorner.y + nodePickerPos.y;
                const newNodes = produce(nodes, (draft) => {
                    draft[generateUuid()] = newNode;
                });
                setNodes(newNodes);
                setNodePickerPos(null);
            }
        },
        [panZoomInfo, nodes, links, nodePickerPos]
    );

    const onConnectorUpdate = React.useCallback(
        (nodeId: string, connectorId: string, connector: ConnectorModel) => {
            const newNodes = produce(nodes, (draft) => {
                draft[nodeId].connectors[connectorId] = connector;
            });
            setNodes(newNodes);
            redrawCanvas(newNodes, links);
        },
        [nodes, links]
    );

    const onContextMenu = React.useCallback(
        (event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
            event.preventDefault();
            if (!nodePickerPos) {
                setNodePickerPos({ x: event.pageX, y: event.pageY });
            } else {
                setNodePickerPos(null);
            }
        },
        [nodePickerPos]
    );

    const canvas = (
        <canvas
            width={640}
            height={480}
            style={{
                width: 640,
                height: 480,
                position: "absolute",
                right: 20,
                bottom: 20,
                backgroundColor: "white"
            }}
            ref={canvasRef}
        />
    );

    const nodePicker = nodePickerPos ? (
        <div
            style={{
                width: 640,
                height: 480,
                position: "absolute",
                top: nodePickerPos.y,
                left: nodePickerPos.x,
                backgroundColor: "white"
            }}>
            <AddNodeContextualMenu nodesSchema={nodesSchemas} onNodeSelection={onNodeSelection} />
        </div>
    ) : null;

    return (
        <div
            style={{ width: "100%", height: "100vh" }}
            onKeyDown={onKeyDown}
            onKeyUp={onKeyUp}
            onContextMenu={onContextMenu}
            tabIndex={0}>
            <NodeEditor
                panZoomInfo={panZoomInfo}
                nodes={nodes}
                links={links}
                selectedItems={selectedItems}
                onPanZoomInfo={setPanZoomInfo}
                onSelectedItems={setSelectedItems}
                onNodeMove={onNodeMove}
                onCreateLink={onCreateLink}
                onConnectorUpdate={onConnectorUpdate}
            />
            {canvas}
            {nodePicker}
        </div>
    );
};

export default OuraCanvasApp;
