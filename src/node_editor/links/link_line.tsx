import React, { Component } from "react";
import * as _ from "lodash";

import { LinkProps } from "./common";
import { default_styles } from "../default_styles";

export default class LineLink extends Component<LinkProps> {

    shouldComponentUpdate(nextProps: LinkProps) : boolean {
        return !_.isEqual(this.props, nextProps);
    }

    render() : JSX.Element | null {
        const link = this.props.link;
        if(link.inputPinPosition && link.outputPinPosition) {
            return (
                <line 
                    x1={link.inputPinPosition.x}
                    y1={link.inputPinPosition.y}
                    x2={link.outputPinPosition.x}
                    y2={link.outputPinPosition.y}
                    style={default_styles.dark.link} />
            );
        }
        return null;
    }
}