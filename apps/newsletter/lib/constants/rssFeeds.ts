import { RssCategory } from '@/lib/models/RssSource'

export interface DefaultFeed {
  name: string
  url: string
  category: RssCategory
}

export const DEFAULT_RSS_FEEDS: DefaultFeed[] = [
  // BIM Practical: Revit, Dynamo, Coordination
  { name: 'BIM Pure',            url: 'https://www.bimpure.com/feed',                                 category: 'bim' },
  { name: 'BIM Corner',          url: 'https://bimcorner.com/feed',                                   category: 'bim' },
  { name: 'Dynamo BIM Blog',     url: 'https://dynamobim.org/feed',                                   category: 'bim' },
  { name: 'Revizto Blog',        url: 'https://revizto.com/en/resources/news/feed/',                  category: 'bim' },
  { name: 'Autodesk AEC Blog',   url: 'https://www.autodesk.com/blogs/aec/feed/',                     category: 'bim' },

  // BIM Management, ISO 19650, BEP
  { name: 'Plannerly Blog',      url: 'https://plannerly.com/feed',                                   category: 'bim' },
  { name: 'AEC Magazine',        url: 'https://aecmag.com/feed/',                                     category: 'bim' },
  { name: 'BIM Today (PBC)',     url: 'https://www.pbctoday.co.uk/news/category/bim-news/feed',       category: 'bim' },

  // AI + BIM + MCP + Models
  { name: 'archBIM.cloud',       url: 'https://archbim.cloud/en/feed',                                category: 'ai-bim' },
  { name: 'The Building Coder',  url: 'https://thebuildingcoder.typepad.com/blog/atom.xml',           category: 'ai-bim' },
  { name: 'ArchiLabs Blog',      url: 'https://archilabs.ai/feed.xml',                                category: 'ai-bim' },
  { name: 'Autodesk Dev Blog',   url: 'https://blog.autodesk.io/feed/',                               category: 'ai-bim' },
  { name: 'Autodesk Digital Builder', url: 'https://www.autodesk.com/blogs/construction/feed/',       category: 'ai-bim' },

  // MEP Coordination, Clash Detection
  { name: 'United-BIM Blog',     url: 'https://www.united-bim.com/feed',                              category: 'mep-coordination' },
  { name: 'ARKANCE Blog',        url: 'https://agacad.com/blog/feed',                                 category: 'mep-coordination' },
  { name: 'Trimble MEP Blog',    url: 'https://mep.trimble.co.uk/blog/feed',                          category: 'mep-coordination' },
  { name: 'Solibri Articles',    url: 'https://www.solibri.com/articles/feed',                        category: 'mep-coordination' },

  // Infrastructure, Standards, Metro/Rail
  { name: 'Railway Gazette',     url: 'https://www.railwaygazette.com/feed',                          category: 'infrastructure' },
  { name: 'buildingSMART News',  url: 'https://www.buildingsmart.org/feed/',                          category: 'infrastructure' },
  { name: 'ENR News',            url: 'https://www.enr.com/rss/news',                                 category: 'infrastructure' },
  { name: 'NBS Blog',            url: 'https://www.thenbs.com/feed',                                  category: 'infrastructure' },
]

export const CATEGORY_COLORS: Record<RssCategory, string> = {
  'bim':              '#1e248c',
  'ai-bim':           '#44b8d3',
  'mep-coordination': '#f97316',
  'infrastructure':   '#16a34a',
  'israel-gov':       '#7c3aed',
  'construction':     '#dc2626',
}

export const CATEGORY_LABELS: Record<RssCategory, string> = {
  'bim':              'BIM',
  'ai-bim':           'AI + BIM',
  'mep-coordination': 'MEP Coordination',
  'infrastructure':   'Infrastructure',
  'israel-gov':       'Israel Gov',
  'construction':     'Construction',
}
