import assert from "node:assert/strict";
import test from "node:test";
import {
  formatOperatorSortingPersons,
  hasOutboundOperatorAssignees,
} from "../src/utils/operatorSortingPersons.ts";

test("formatOperatorSortingPersons tolerates missing or dirty lists", () => {
  assert.equal(formatOperatorSortingPersons(undefined), "");
  assert.equal(formatOperatorSortingPersons(null), "");
  assert.equal(formatOperatorSortingPersons([" a ", "", "b"]), "a, b");
  assert.equal(formatOperatorSortingPersons(["x", null, 2]), "x, 2");
});

test("hasOutboundOperatorAssignees is false when zone has no assignees", () => {
  assert.equal(hasOutboundOperatorAssignees(undefined), false);
  assert.equal(hasOutboundOperatorAssignees([]), false);
  assert.equal(hasOutboundOperatorAssignees(["operator1"]), true);
});
