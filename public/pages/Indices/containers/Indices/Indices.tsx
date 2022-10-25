/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from "react";
import _ from "lodash";
import { RouteComponentProps } from "react-router-dom";
import queryString from "query-string";
import {
  EuiBasicTable,
  EuiHorizontalRule,
  // @ts-ignore
  Criteria,
  EuiTableSortingType,
  Direction,
  // @ts-ignore
  Pagination,
  EuiTableSelectionType,
  ArgsWithError,
  ArgsWithQuery,
  Query,
  EuiButton,
  EuiContextMenu,
  EuiIcon,
} from "@elastic/eui";
import { ContentPanel, ContentPanelActions } from "../../../../components/ContentPanel";
import IndexControls from "../../components/IndexControls";
import ApplyPolicyModal from "../../components/ApplyPolicyModal";
import IndexEmptyPrompt from "../../components/IndexEmptyPrompt";
import SimplePopover from "../../../../components/SimplePopover";
import { DEFAULT_PAGE_SIZE_OPTIONS, DEFAULT_QUERY_PARAMS, indicesColumns } from "../../utils/constants";
import { ModalConsumer } from "../../../../components/Modal";
import IndexService from "../../../../services/IndexService";
import CommonService from "../../../../services/CommonService";
import { DataStream, ManagedCatIndex } from "../../../../../server/models/interfaces";
import { getURLQueryParams } from "../../utils/helpers";
import { IndicesQueryParams } from "../../models/interfaces";
import { BREADCRUMBS, ROUTES } from "../../../../utils/constants";
import { getErrorMessage } from "../../../../utils/helpers";
import { CoreServicesContext } from "../../../../components/core_services";
import { SECURITY_EXCEPTION_PREFIX } from "../../../../../server/utils/constants";
import DeleteIndexModal from "../../components/DeleteIndexModal";

interface IndicesProps extends RouteComponentProps {
  indexService: IndexService;
  commonService: CommonService;
}

interface IndicesState {
  totalIndices: number;
  from: number;
  size: number;
  search: string;
  query: Query;
  sortField: keyof ManagedCatIndex;
  sortDirection: Direction;
  selectedItems: ManagedCatIndex[];
  indices: ManagedCatIndex[];
  loadingIndices: boolean;
  showDataStreams: boolean;
  isDataStreamColumnVisible: boolean;
  deleteIndexModalVisible: boolean;
}

export default class Indices extends Component<IndicesProps, IndicesState> {
  static contextType = CoreServicesContext;
  constructor(props: IndicesProps) {
    super(props);
    const { from, size, search, sortField, sortDirection, showDataStreams } = getURLQueryParams(this.props.location);
    this.state = {
      totalIndices: 0,
      from,
      size,
      search,
      query: Query.parse(search),
      sortField,
      sortDirection,
      selectedItems: [],
      indices: [],
      loadingIndices: true,
      showDataStreams,
      isDataStreamColumnVisible: showDataStreams,
      deleteIndexModalVisible: false,
    };

    this.getIndices = _.debounce(this.getIndices, 500, { leading: true });
  }

  async componentDidMount() {
    this.context.chrome.setBreadcrumbs([BREADCRUMBS.INDEX_MANAGEMENT, BREADCRUMBS.INDICES]);
    await this.getIndices();
  }

  async componentDidUpdate(prevProps: IndicesProps, prevState: IndicesState) {
    const prevQuery = Indices.getQueryObjectFromState(prevState);
    const currQuery = Indices.getQueryObjectFromState(this.state);
    if (!_.isEqual(prevQuery, currQuery)) {
      await this.getIndices();
    }
  }

  static getQueryObjectFromState({ from, size, search, sortField, sortDirection, showDataStreams }: IndicesState): IndicesQueryParams {
    return { from, size, search, sortField, sortDirection, showDataStreams };
  }

  getIndices = async (): Promise<void> => {
    this.setState({ loadingIndices: true });
    try {
      const { indexService, history } = this.props;
      const queryObject = Indices.getQueryObjectFromState(this.state);
      const queryParamsString = queryString.stringify(queryObject);
      history.replace({ ...this.props.location, search: queryParamsString });

      const getIndicesResponse = await indexService.getIndices({
        ...queryObject,
        terms: this.getTermClausesFromState(),
        indices: this.getFieldClausesFromState("indices"),
        dataStreams: this.getFieldClausesFromState("data_streams"),
      });

      if (getIndicesResponse.ok) {
        const { indices, totalIndices } = getIndicesResponse.response;
        this.setState({ indices, totalIndices });
      } else {
        this.context.notifications.toasts.addDanger(getIndicesResponse.error);
      }
    } catch (err) {
      this.context.notifications.toasts.addDanger(getErrorMessage(err, "There was a problem loading the indices"));
    }

    // Avoiding flicker by showing/hiding the "Data stream" column only after the results are loaded.
    const { showDataStreams } = this.state;
    this.setState({ loadingIndices: false, isDataStreamColumnVisible: showDataStreams });
  };

  getDataStreams = async (): Promise<DataStream[]> => {
    const { indexService } = this.props;
    const serverResponse = await indexService.getDataStreams();
    if (!serverResponse.ok) {
      if (serverResponse.error.startsWith(SECURITY_EXCEPTION_PREFIX)) {
        this.context.notifications.toasts.addWarning(serverResponse.error);
      }
    }
    return serverResponse.response.dataStreams;
  };

  toggleShowDataStreams = () => {
    const { showDataStreams } = this.state;
    this.setState({ showDataStreams: !showDataStreams });
  };

  getFieldClausesFromState = (clause: string): string[] => {
    const { query } = this.state;
    return _.flatten((query.ast.getFieldClauses(clause) || []).map((field) => field.value));
  };

  getTermClausesFromState = (): string[] => {
    const { query } = this.state;
    return (query.ast.getTermClauses() || []).map((term) => term.value);
  };

  onTableChange = ({ page: tablePage, sort }: Criteria<ManagedCatIndex>): void => {
    const { index: page, size } = tablePage;
    const { field: sortField, direction: sortDirection } = sort;
    this.setState({ from: page * size, size, sortField, sortDirection });
  };

  onSelectionChange = (selectedItems: ManagedCatIndex[]): void => {
    this.setState({ selectedItems });
  };

  onSearchChange = ({ query, queryText, error }: ArgsWithQuery | ArgsWithError): void => {
    if (error) {
      return;
    }

    this.setState({ from: 0, search: queryText, query });
  };

  resetFilters = (): void => {
    this.setState({ search: DEFAULT_QUERY_PARAMS.search, query: Query.parse(DEFAULT_QUERY_PARAMS.search) });
  };

  onDeleteIndexModalConfirm = async () => {
    const result = await this.props.commonService.apiCaller({
      endpoint: "indices.delete",
      data: {
        index: this.state.selectedItems.map((item) => item.index).join(","),
      },
    });
    if (result && result.ok) {
      this.onDeleteIndexModalClose();
      this.context.notifications.toasts.addSuccess("Delete successfully");
      this.getIndices();
    } else {
      this.context.notifications.toasts.addDanger(result.error);
    }
  };

  onDeleteIndexModalClose = () => {
    this.setState({
      deleteIndexModalVisible: false,
    });
  };

  render() {
    const {
      totalIndices,
      from,
      size,
      search,
      sortField,
      sortDirection,
      selectedItems,
      indices,
      loadingIndices,
      showDataStreams,
      isDataStreamColumnVisible,
      deleteIndexModalVisible,
    } = this.state;

    const filterIsApplied = !!search;
    const page = Math.floor(from / size);

    const pagination: Pagination = {
      pageIndex: page,
      pageSize: size,
      pageSizeOptions: DEFAULT_PAGE_SIZE_OPTIONS,
      totalItemCount: totalIndices,
    };

    const sorting: EuiTableSortingType<ManagedCatIndex> = {
      sort: {
        direction: sortDirection,
        field: sortField,
      },
    };

    const selection: EuiTableSelectionType<ManagedCatIndex> = {
      onSelectionChange: this.onSelectionChange,
    };
    return (
      <ContentPanel
        actions={
          <ModalConsumer>
            {({ onShow }) => (
              <ContentPanelActions
                actions={[
                  {
                    children: (
                      <SimplePopover
                        data-test-subj="More Action"
                        panelPaddingSize="none"
                        button={
                          <EuiButton iconType="arrowDown" iconSide="right">
                            Actions
                          </EuiButton>
                        }
                      >
                        <EuiContextMenu
                          initialPanelId={0}
                          panels={[
                            {
                              id: 0,
                              items: [
                                {
                                  name: "Delete",
                                  disabled: !this.state.selectedItems.length,
                                  "data-test-subj": "Delete Action",
                                  icon: <EuiIcon type="trash" size="m" color="danger" />,
                                  onClick: () =>
                                    this.setState({
                                      deleteIndexModalVisible: true,
                                    }),
                                },
                              ],
                            },
                          ]}
                        />
                      </SimplePopover>
                    ),
                    text: "",
                  },
                  {
                    text: "Apply policy",
                    buttonProps: {
                      disabled: !selectedItems.length,
                      onClick: () =>
                        onShow(ApplyPolicyModal, {
                          indices: selectedItems.map((item: ManagedCatIndex) => item.index),
                          core: this.context,
                        }),
                    },
                  },
                  {
                    text: "Create Index",
                    buttonProps: {
                      fill: true,
                      onClick: () => {
                        this.props.history.push(ROUTES.CREATE_INDEX);
                      },
                    },
                  },
                ]}
              />
            )}
          </ModalConsumer>
        }
        bodyStyles={{ padding: "initial" }}
        title="Indices"
      >
        <IndexControls
          search={search}
          onSearchChange={this.onSearchChange}
          onRefresh={this.getIndices}
          showDataStreams={showDataStreams}
          getDataStreams={this.getDataStreams}
          toggleShowDataStreams={this.toggleShowDataStreams}
        />

        <EuiHorizontalRule margin="xs" />

        <EuiBasicTable
          columns={indicesColumns(isDataStreamColumnVisible)}
          isSelectable={true}
          itemId="index"
          items={indices}
          noItemsMessage={<IndexEmptyPrompt filterIsApplied={filterIsApplied} loading={loadingIndices} resetFilters={this.resetFilters} />}
          onChange={this.onTableChange}
          pagination={pagination}
          selection={selection}
          sorting={sorting}
        />

        <DeleteIndexModal
          selectedItems={selectedItems.map((item) => item.index)}
          visible={deleteIndexModalVisible}
          onClose={this.onDeleteIndexModalClose}
          onConfirm={this.onDeleteIndexModalConfirm}
        />
      </ContentPanel>
    );
  }
}
