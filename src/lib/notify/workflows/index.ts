/**
 * Code-first workflow definitions, served from `/api/novu`. Sync them into
 * the Novu dashboard with:
 *
 *   npx novu sync --bridge-url https://<host>/api/novu \
 *                 --secret-key $NOVU_API_KEY
 *
 * (See docs/novu-setup.md for the full sync workflow.)
 *
 * Adding a workflow: create a new file in this directory, export the
 * `workflow(...)` instance, and add it to the array below.
 */
import { orderPaidWorkflow } from "./order-paid";
import { listingSoldWorkflow } from "./listing-sold";
import { offerReceivedWorkflow } from "./offer-received";
import { bountyHitWorkflow } from "./bounty-hit";
import { outbidWorkflow } from "./outbid";

export const workflows = [
  orderPaidWorkflow,
  listingSoldWorkflow,
  offerReceivedWorkflow,
  bountyHitWorkflow,
  outbidWorkflow,
];
