import path from "path"
import fs from "fs"
import { globSync } from "glob"
import { convert } from "html-to-text"
import JSDOM from "jsdom"
import Fuse from "fuse.js"

const excludePaths = ["/search"]

interface SearchIndexItem {
  title: string
  description: string
  body: string
  path: string
}

interface SearchIndexData {
  index: { keys: readonly string[]; records: unknown }
  indexData: SearchIndexItem[]
  buildTime: number
}

export async function buildSearchIndex(): Promise<SearchIndexData> {
  const indexData: SearchIndexItem[] = []

  // iterate all files with html extension in ./svelte-kit/output/prerendered/pages
  const fileRoot = path.resolve(".")
  const pagesPath = path.join(fileRoot, ".svelte-kit/output/prerendered/pages")

  const allFiles = globSync(path.join(pagesPath, "**/*.html"))
  const filteredFiles = allFiles.filter(
    (file) => !excludePaths.some((path) => file.includes(path)),
  )

  console.log("Building search index...")

  for (const filePath of filteredFiles) {
    // get html
    const html = fs.readFileSync(filePath, "utf-8")
    // get text
    const body = convert(html)
    // parse meta tags
    const dom = new JSDOM.JSDOM(html)
    const document = dom.window.document
    const title =
      document.querySelector("title")?.textContent ||
      document.querySelector("h1")?.textContent ||
      "Untitled"
    const description =
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content") || ""

    // derive path from file path
    const relativePath = path.relative(pagesPath, filePath)
    const urlPath =
      "/" + relativePath.replace("/index.html", "").replace(".html", "")

    // make sure the path ends with a trailing slash
    const finalPath =
      urlPath === "/" ? "/" : urlPath.endsWith("/") ? urlPath : urlPath + "/"

    const indexEntry: SearchIndexItem = {
      title,
      description,
      body,
      path: finalPath,
    }

    indexData.push(indexEntry)

    if (indexData.length < 20) {
      // console.log('Index entry:', indexEntry);
    }
  }

  const index = Fuse.createIndex(["title", "description", "body"], indexData)
  const jsonIndex = index.toJSON()
  const data: SearchIndexData = {
    index: jsonIndex,
    indexData,
    buildTime: Date.now(),
  }
  return data
}

// Build search index into the output directory, for use in the build process (see vite.config.js)
export async function buildAndCacheSearchIndex(): Promise<void> {
  const data = await buildSearchIndex()

  const outputDir = ".svelte-kit/output/client/"
  const outputPath = path.join(outputDir, "search_index.json")

  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(data))

  console.log("Search index built")
}
