import { SearchInterface } from "~components/SearchInterface"

export function Main({ name = "Extension" }: { name?: string }) {
  return <SearchInterface title={`Browser Spotlight ${name}`} />
}
