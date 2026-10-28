import catalogData from "../data/catalog.json";
import type {
  ContentCatalog,
  ContentGroup,
  ContentSection,
} from "../types";

export const catalog = catalogData as ContentCatalog;

export const sectionById = new Map<string, ContentSection>(
  catalog.sections.map((section) => [section.id, section]),
);

export const groupById = new Map<string, ContentGroup>(
  catalog.groups.map((group) => [group.id, group]),
);

export const sectionsByGroup = new Map<string, ContentSection[]>(
  catalog.groups.map((group) => [
    group.id,
    group.sectionIds
      .map((id) => sectionById.get(id))
      .filter((section): section is ContentSection => Boolean(section)),
  ]),
);

export const sectionIndexById = new Map(
  catalog.sections.map((section, index) => [section.id, index]),
);

export function getAdjacentSections(sectionId: string) {
  const index = sectionIndexById.get(sectionId);
  if (index === undefined) return { previous: null, next: null };
  return {
    previous: index > 0 ? catalog.sections[index - 1] : null,
    next:
      index < catalog.sections.length - 1
        ? catalog.sections[index + 1]
        : null,
  };
}

export function sectionHref(sectionId: string) {
  return `/section/${sectionId}`;
}
