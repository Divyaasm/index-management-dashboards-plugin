/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { forwardRef } from "react";
import { EuiComboBoxProps } from "@elastic/eui";
import RemoteSelect, { RemoteSelectProps } from "../../../../components/RemoteSelect";
import { ServerResponse } from "../../../../../server/models/types";
import { filterByMinimatch } from "../../../../../utils/helper";
import { SYSTEM_ALIAS } from "../../../../../utils/constants";

export interface AliasSelectProps extends Omit<EuiComboBoxProps<{ label: string; value: string }>, "value" | "onChange"> {
  value?: Record<string, {}>;
  onChange?: (value: AliasSelectProps["value"]) => void;
  refreshOptions: (aliasName: string) => Promise<ServerResponse<{ alias: string }[]>>;
}

const transformObjToArray = (obj: AliasSelectProps["value"]): { label: string }[] => {
  return Object.keys(obj || {}).map((label) => ({ label }));
};
const transformArrayToObj = (array: { label: string }[]): AliasSelectProps["value"] => {
  return array.reduce((total, current) => ({ ...total, [current.label]: {} }), {});
};

const AliasSelect = forwardRef((props: AliasSelectProps, ref: React.Ref<HTMLInputElement>) => {
  const { value, onChange, refreshOptions: refreshOptionsFromProps } = props;
  const refreshOptions: RemoteSelectProps["refreshOptions"] = ({ searchValue }) => {
    return refreshOptionsFromProps(searchValue || "").then((res) => {
      if (res.ok) {
        return {
          ...res,
          response: [...new Set(res.response.map((item) => item.alias).filter((item) => !filterByMinimatch(item, SYSTEM_ALIAS)))].map(
            (item) => ({
              label: item,
            })
          ),
        };
      } else {
        return res;
      }
    });
  };
  return (
    <RemoteSelect
      {...(props as Partial<EuiComboBoxProps<any>>)}
      placeholder="Select or create aliases"
      customOptionText="Add {searchValue} as a new alias"
      refreshOptions={refreshOptions}
      value={transformObjToArray(value).map((item) => item.label)}
      onChange={(val) => {
        onChange && onChange(transformArrayToObj(val.map((label) => ({ label }))));
      }}
    />
  );
});

AliasSelect.displayName = "AliasSelect";

// @ts-ignore
export default AliasSelect;