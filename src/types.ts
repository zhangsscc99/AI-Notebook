export interface ContentGroup {
  id: string;
  title: string;
  description: string;
  sectionIds: string[];
}

export interface ContentSection {
  id: string;
  title: string;
  menuTitle: string;
  groupId: string;
  groupTitle: string;
  order: number;
  source: string;
  readingMinutes: number;
}

export interface ContentCatalog {
  generatedAt: string;
  groups: ContentGroup[];
  sections: ContentSection[];
}

export interface SearchRecord extends ContentSection {
  excerpt: string;
  headings: string[];
  searchText: string;
}
