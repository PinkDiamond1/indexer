import { GluegunToolbox } from 'gluegun'
import chalk from 'chalk'

import {
  Action,
  ActionParams,
  ActionResult,
  OrderDirection,
} from '@graphprotocol/indexer-common'
import { loadValidatedConfig } from '../../../config'
import { createIndexerManagementClient } from '../../../client'
import { fixParameters, printObjectOrArray } from '../../../command-helpers'
import { fetchAction, fetchActions } from '../../../actions'

const HELP = `
${chalk.bold('graph indexer actions get')} [options]
${chalk.bold('graph indexer allocations get')} [options] <action-id>
${chalk.bold('graph indexer allocations get')} [options] all

${chalk.dim('Options:')}

  -h, --help                                                        Show usage information
      --type    allocate|unallocate|reallocate|collect              Filter by type
      --status  queued|approved|pending|success|failed|canceled     Filter by status 
      --source <source>                                             Fetch only actions queued by a specific source
      --reason <reason>                                             Fetch only actions queued for a specific reason
      --orderBy id|deploymentID|amount|priority|...|updatedAt       Order actions by a specific field (default: id)
      --orderDirection asc|desc                                     Order direction (default: desc)
  -o, --output table|json|yaml                                      Choose the output format: table (default), JSON, or YAML
`

module.exports = {
  name: 'get',
  alias: [],
  description: 'List one or more actions',
  run: async (toolbox: GluegunToolbox) => {
    const { print, parameters } = toolbox

    const inputSpinner = toolbox.print.spin('Processing inputs')

    const { type, status, source, reason, orderBy, orderDirection, h, help, o, output } =
      parameters.options

    const [action] = fixParameters(parameters, { h, help }) || []
    let orderByParam = ActionParams.ID
    let orderDirectionValue = OrderDirection.DESC
    const outputFormat = o || output || 'table'

    if (help || h) {
      inputSpinner.stopAndPersist({ symbol: '💁', text: HELP })
      return
    }

    try {
      if (!['json', 'yaml', 'table'].includes(outputFormat)) {
        throw Error(
          `Invalid output format "${outputFormat}" must be one of ['json', 'yaml' or 'table']`,
        )
      }

      if (
        status &&
        !['queued', 'approved', 'pending', 'success', 'failed', 'canceled'].includes(
          status,
        )
      ) {
        throw Error(
          `Invalid '--status' provided, must be one of ['queued', 'approved', 'pending', 'success', 'failed', 'canceled]`,
        )
      }

      if (action) {
        if (action !== 'all' && isNaN(+action)) {
          throw Error(
            `Invalid 'actionID' provided ('${action}'), must be a numeric id or 'all'`,
          )
        }

        if (action == 'all') {
          if (type || status || source || reason) {
            throw Error(
              `Invalid query, cannot specify '--type', '--status', '--source' or '--reason' filters in addition to 'action = all'`,
            )
          }
        }
      }

      if (orderBy) {
        orderByParam = ActionParams[orderBy.toUpperCase() as keyof typeof ActionParams]
        orderDirectionValue = orderDirection
          ? OrderDirection[orderDirection.toUpperCase() as keyof typeof OrderDirection]
          : OrderDirection.DESC
      }
      inputSpinner.succeed('Processed input parameters')
    } catch (error) {
      inputSpinner.fail(error.toString())
      print.info(HELP)
      process.exitCode = 1
      return
    }

    const actionSpinner = toolbox.print.spin('Querying actions')

    try {
      const config = loadValidatedConfig()
      const client = await createIndexerManagementClient({ url: config.api })

      // TODO: default to filtering out 'CANCELED' actions
      // Default ordering is [id, desc] if no orderBy is provided
      let actions: ActionResult[] = []
      if (action) {
        if (action === 'all') {
          actions = await fetchActions(client, {}, orderByParam, orderDirectionValue)
        } else {
          actions = [await fetchAction(client, +action)]
        }
      } else {
        actions = await fetchActions(
          client,
          {
            type,
            status,
            source,
            reason,
          },
          orderByParam,
          orderDirectionValue,
        )
      }
      actionSpinner.succeed('Actions query returned')

      if (!actions || actions.length === 0) {
        print.info('No actions found')
        process.exitCode = 1
        return
      }

      const displayProperties: (keyof Action)[] = [
        'id',
        'type',
        'deploymentID',
        'allocationID',
        'amount',
        'poi',
        'force',
        'priority',
        'status',
        'source',
        'failureReason',
        'transaction',
        'reason',
      ]

      printObjectOrArray(print, outputFormat, actions, displayProperties)
    } catch (error) {
      actionSpinner.fail(error.toString())
      process.exitCode = 1
      return
    }
  },
}
