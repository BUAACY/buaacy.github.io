import test from "node:test";
import assert from "node:assert/strict";
import { loadConfigs, validateConfigs } from "./config-validation.js";
import { parseConfig } from "../src/utils/parseConfig.js";

test("current configuration and asset references are valid", () => {
  assert.deepEqual(validateConfigs(loadConfigs()), []);
});
test("JSONC supports comments without corrupting strings", () => {
  const source = '{ // heading\n "url": "https://example.com/*keep*/", /* note */ "value": 1 }';
  assert.equal(parseConfig(source, "theme.jsonc", true).url, "https://example.com/*keep*/");
  assert.throws(() => parseConfig(source, "content.json"), /content.json:1:/);
  assert.throws(() => parseConfig('{"value":}', "broken.json"), /broken.json:1:/);
});
test("missing required fields report their file and location", () => {
  const config = loadConfigs();
  delete config["hero.json"].primaryLinks;
  assert.match(validateConfigs(config).join("\n"), /hero.json.*primaryLinks/);
});

test("duplicate publication IDs and unknown preview IDs are rejected", () => {
  const config = loadConfigs();

  // Create a duplicate using an existing publication.
  config["publications.json"].push({
    ...config["publications.json"][0],
  });

  // Introduce a preview with no matching publication.
  config["publication-previews.json"] = {
    "missing-paper": { template: "basic" },
  };

  const errors = validateConfigs(config).join("\n");

  assert.match(errors, /duplicate ID/);
  assert.match(errors, /missing-paper: no publication/);
});

test("publications without custom previews are valid", () => {
  const config = loadConfigs();

  config["publication-previews.json"] = {};

  assert.deepEqual(validateConfigs(config), []);
});

test("missing assets and invalid chart values are rejected", () => {
  const config = loadConfigs();
  const paperId = config["publications.json"][0].id;

  config["publication-previews.json"] = {
    [paperId]: {
      template: "basic",
      figure: "assets/nonexistent-test-file.png",
      rows: [
        {
          label: "Example",
          value: "2",
        },
      ],
    },
  };

  const errors = validateConfigs(config, () => false).join("\n");

  assert.match(errors, /asset not found/);
  assert.match(errors, /rows\/0\/value/);
});

test("layout-specific fields and unknown keys are checked", () => {
  const config = loadConfigs();
  const paperId = config["publications.json"][0].id;

  config["publication-previews.json"] = {
    [paperId]: {
      template: "budget",
    },
  };

  assert.match(
    validateConfigs(config).join("\n"),
    /ablationRows: required/
  );

  config["education.json"].enable = true;

  assert.match(
    validateConfigs(config).join("\n"),
    /additionalProperty.*enable/
  );
});

test("fixed templates support minimal basic, narrative and legacy layout configs", () => {
  const config = loadConfigs();
  const paper = config["publications.json"][0];
  const paperId = paper.id;

  const narrative = {
    takeaway: "Research takeaway",
    intro: "Research introduction",
    headline: "Research headline",
    method: "Research methodology",
    figure: paper.image,
    figureCaption: "Method illustration",
    steps: [
      {
        title: "Step 1",
        text: "Research step description",
      },
    ],
  };

  // Basic template.
  config["publication-previews.json"] = {
    [paperId]: {
      template: "basic",
      abstractExpanded: true,
    },
  };

  assert.deepEqual(validateConfigs(config), []);

  // Narrative template.
  config["publication-previews.json"][paperId] = {
    template: "narrative",
    ...narrative,
    blendFigureBackground: false,
    labels: {
      idea: "Research question",
    },
  };

  assert.deepEqual(validateConfigs(config), []);

  // Missing required narrative figure.
  delete config["publication-previews.json"][paperId].figure;

  assert.match(
    validateConfigs(config).join("\n"),
    /figure: required for narrative/
  );

  // Legacy layout configuration.
  config["publication-previews.json"][paperId] = {
    ...narrative,
    layout: "narrative",
  };

  assert.deepEqual(validateConfigs(config), []);
});

