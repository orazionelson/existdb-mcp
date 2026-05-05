import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { getExistConfig, makeAuthHeader } from "../src/tools/query-helpers.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.EXISTDB_ENDPOINT;
  delete process.env.EXISTDB_USER;
  delete process.env.EXISTDB_PASSWORD;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("getExistConfig", () => {
  it("uses defaults when nothing is provided", () => {
    const c = getExistConfig({});
    assert.equal(c.endpoint, "http://localhost:8080/exist");
    assert.equal(c.username, "admin");
    assert.equal(c.password, "");
  });

  it("falls back to environment variables", () => {
    process.env.EXISTDB_ENDPOINT = "http://db.example.com:8080/exist";
    process.env.EXISTDB_USER = "alice";
    process.env.EXISTDB_PASSWORD = "s3cret";

    const c = getExistConfig({});
    assert.equal(c.endpoint, "http://db.example.com:8080/exist");
    assert.equal(c.username, "alice");
    assert.equal(c.password, "s3cret");
  });

  it("explicit args take precedence over environment", () => {
    process.env.EXISTDB_ENDPOINT = "http://from-env";
    process.env.EXISTDB_USER = "env-user";

    const c = getExistConfig({
      endpoint: "http://from-args",
      username: "arg-user",
      password: "arg-pass",
    });
    assert.equal(c.endpoint, "http://from-args");
    assert.equal(c.username, "arg-user");
    assert.equal(c.password, "arg-pass");
  });

  it("strips trailing slashes from the endpoint", () => {
    const c = getExistConfig({ endpoint: "http://localhost:8080/exist///" });
    assert.equal(c.endpoint, "http://localhost:8080/exist");
  });
});

describe("makeAuthHeader", () => {
  it("produces a valid HTTP Basic header", () => {
    const header = makeAuthHeader({
      endpoint: "x",
      username: "admin",
      password: "secret",
    });
    assert.equal(header, "Basic " + Buffer.from("admin:secret").toString("base64"));
  });

  it("handles an empty password", () => {
    const header = makeAuthHeader({
      endpoint: "x",
      username: "admin",
      password: "",
    });
    assert.equal(header, "Basic " + Buffer.from("admin:").toString("base64"));
  });
});
