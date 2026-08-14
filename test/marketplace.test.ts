import { describe, expect, it } from "vitest";
import { parseMarketplaceHtml } from "../server/marketplace.js";

describe("PI marketplace catalog", () => {
  it("parses extension cards and catalog pagination", () => {
    const html = `
      <h2>All packages <span>1-50 / 3,113 (of 5,322)</span></h2>
      <article data-package-card="true" data-package-name="@scope/pi-tools" data-package-types="extension skill" data-package-downloads="1234">
        <p class="packages-desc">Tools &amp; useful helpers</p>
        <div class="packages-meta"><span>Mo &amp; Co</span><span>1.2K/mo</span><span>2h ago</span></div>
        <div class="packages-links"><a href="https://www.npmjs.com/package/@scope/pi-tools">npm</a><a href="https://github.com/example/pi-tools">repo</a></div>
      </article>
      <a href="/packages?type=extension&amp;page=63">63</a>`;
    const result = parseMarketplaceHtml(html);
    expect(result).toMatchObject({ page: 1, pages: 63, total: 3113, allPackagesTotal: 5322, source: "pi.dev" });
    expect(result.items).toEqual([expect.objectContaining({
      name: "@scope/pi-tools",
      description: "Tools & useful helpers",
      author: "Mo & Co",
      downloads: 1234,
      downloadsLabel: "1.2K/mo",
      types: ["extension", "skill"],
      installCommand: "pi install npm:@scope/pi-tools",
      npmUrl: "https://www.npmjs.com/package/@scope/pi-tools",
      repositoryUrl: "https://github.com/example/pi-tools",
    })]);
  });

  it("drops unsafe external URLs", () => {
    const html = `<div>1-1 / 1</div><article data-package-card="true" data-package-name="pi-safe" data-package-types="extension" data-package-downloads="0"><p class="packages-desc">Safe</p><div class="packages-meta"><span>A</span><span>0/mo</span><span>now</span></div><a href="javascript:alert(1)">npm</a></article>`;
    expect(parseMarketplaceHtml(html).items[0]).toMatchObject({ npmUrl: "https://www.npmjs.com/package/pi-safe" });
  });
});
