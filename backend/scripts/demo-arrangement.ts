/**
 * The lecturer's arrangement (BS-34), for the demo catalogue: his textbook subjects and research
 * areas, demo textbooks under his own titles, and demo papers in each area. Everything here is
 * tagged `demo` when seeded and removed by `seed:demo -- --remove`; the real books replace it.
 */

/** One subject list for books and papers. Lower sortOrder first. */
export const ARRANGED_SUBJECTS = [
  {
    name: 'Manufacturing and Workshop Technology',
    description:
      'Manufacturing processes, workshop practice and machine tools.',
    sortOrder: 1,
  },
  {
    name: 'Foundry Technology',
    description:
      'The foundry as a whole: moulding, melting, casting and quality.',
    sortOrder: 2,
  },
  {
    name: 'Heat Treatment and Metal Forming',
    description:
      'Annealing, hardening and tempering, and the forming of metals.',
    sortOrder: 3,
  },
  {
    name: 'Technical Drawing',
    description:
      'Drawing instruments, projections, sections and engineering drawing practice.',
    sortOrder: 4,
  },
  {
    name: 'Engineering Materials',
    description: 'The structure and properties of engineering materials.',
    sortOrder: 5,
  },
  {
    name: 'Iron and Steel Making',
    description: 'Ironmaking, steelmaking and the Nigerian steel industry.',
    sortOrder: 6,
  },
  {
    name: 'Safety',
    description:
      'Safety in foundries, workshops and industry, and how it is taught.',
    sortOrder: 7,
  },
  {
    name: 'History and Development of Technical Education in Nigeria',
    description:
      'How technical education in Nigeria began and grew, from trade centres to polytechnics.',
    sortOrder: 8,
  },
  {
    name: 'Technical Education and Techno-Industrial Development',
    description:
      'The role of technical education in the techno-industrial development of the nation.',
    sortOrder: 9,
  },
];

/** Where the existing demo books belong in the new arrangement. The owner's real book is never moved. */
export const REARRANGE: Record<string, string[]> = {
  'Heat Treatment of Steels': ['Heat Treatment and Metal Forming'],
  'Sand Moulding and Core Making': ['Foundry Technology'],
  'Casting Defects': ['Foundry Technology'],
  'Annealing, Quenching and Tempering': ['Heat Treatment and Metal Forming'],
  'Furnaces and Melting Practice': ['Foundry Technology'],
  'Non-Ferrous Casting': ['Foundry Technology'],
  'Physical Metallurgy for Foundry Engineers': [
    'Engineering Materials',
    'Foundry Technology',
  ],
  'Gating and Risering Design': ['Foundry Technology'],
  'Cast Irons': ['Engineering Materials', 'Foundry Technology'],
  'Surface Hardening of Steels': ['Heat Treatment and Metal Forming'],
  'Investment Casting': ['Foundry Technology'],
};

/** Never moved or changed by the demo tooling. */
export const OWNER_BOOK_TITLE = 'Principles of Foundry Technology';

export interface ArrangedTextbook {
  title: string;
  subtitle: string;
  edition: string;
  categories: string[];
  featured?: boolean;
  pages: number;
  abstract: string;
  description: string;
  toc: string[];
  ebook: [number, number, number, number];
  print?: [number, number, number, number];
  stock?: number;
  tags: string[];
}

/** Demo textbooks under the lecturer's own titles (his real files replace them). */
export const ARRANGED_TEXTBOOKS: ArrangedTextbook[] = [
  {
    title: 'Manufacturing Technology',
    subtitle: 'Processes, machines and production',
    edition: '2nd edition',
    categories: ['Manufacturing and Workshop Technology'],
    featured: true,
    pages: 356,
    abstract:
      'A complete introduction to how engineering products are made: casting, forming, machining, joining and finishing, with the planning and quality control that tie them together. Each process is explained from first principles, with worked examples and end-of-chapter problems.',
    description:
      'For students of mechanical and production engineering in universities, polytechnics and colleges of education (technical).\n\n**Inside:**\n\n- Casting, forming and powder processes\n- Machining and machine tools\n- Welding and other joining methods\n- Measurement, tolerances and quality control\n- Production planning',
    toc: [
      'Manufacturing and the economy',
      'Casting processes',
      'Metal forming',
      'Machining',
      'Joining processes',
      'Surface finishing',
      'Measurement and quality',
      'Production planning',
    ],
    ebook: [12000, 1999, 1599, 1799],
    print: [22000, 3499, 2899, 3199],
    stock: 30,
    tags: ['manufacturing', 'production', 'machining', 'welding'],
  },
  {
    title: 'Foundry Technology',
    subtitle: 'Patterns, moulds, melting and casting',
    edition: '1st edition',
    categories: ['Foundry Technology'],
    pages: 318,
    abstract:
      'The foundry from start to finish: patterns and allowances, moulding sands and cores, gating and risering, melting and pouring, and the inspection of castings. Written from long experience of teaching foundry practice to engineering students.',
    description:
      'A textbook for foundry technology courses, with practical exercises for the workshop.\n\n- Pattern making and allowances\n- Sand testing and control\n- Gating and riser calculations\n- Melting furnaces and metal treatment\n- Casting defects and their remedies',
    toc: [
      'The foundry industry',
      'Patterns',
      'Moulding sands',
      'Cores',
      'Gating and risering',
      'Melting and pouring',
      'Cleaning and inspection',
    ],
    ebook: [12000, 1999, 1599, 1799],
    print: [21000, 3299, 2799, 2999],
    stock: 25,
    tags: ['foundry', 'casting', 'moulding'],
  },
  {
    title: 'Heat Treatment and Metal Forming Technology',
    subtitle: 'Changing the properties and the shape of metals',
    edition: '1st edition',
    categories: ['Heat Treatment and Metal Forming'],
    pages: 296,
    abstract:
      'How the properties of metals are changed by heat treatment, and how metals are shaped by forging, rolling, extrusion, drawing and pressing. The two are taught together because the forming process and the heat treatment that follows decide the final properties of a part.',
    description:
      '- The iron–carbon diagram and transformation diagrams\n- Annealing, normalising, hardening and tempering\n- Case hardening\n- Hot and cold working\n- Forging, rolling, extrusion and sheet-metal forming',
    toc: [
      'Structure of metals',
      'The iron–carbon diagram',
      'Heat treatment of steels',
      'Surface hardening',
      'Principles of metal forming',
      'Forging and rolling',
      'Extrusion and drawing',
      'Sheet-metal forming',
    ],
    ebook: [11000, 1799, 1499, 1699],
    print: [20000, 3199, 2699, 2899],
    stock: 20,
    tags: ['heat treatment', 'forging', 'rolling', 'metal forming'],
  },
  {
    title: 'Basic Workshop Technology and Machine Tools Practice',
    subtitle: 'Safe, accurate work in the engineering workshop',
    edition: '3rd edition',
    categories: ['Manufacturing and Workshop Technology', 'Safety'],
    featured: true,
    pages: 264,
    abstract:
      'The skills every engineering student needs in the workshop: safety, measuring and marking out, bench work, drilling, turning, milling and grinding. Step-by-step practical exercises build accuracy and confidence on each machine.',
    description:
      'Suitable for first- and second-year students in universities, polytechnics and technical colleges.\n\n- Workshop safety\n- Measuring and marking-out tools\n- Bench fitting\n- Drilling, turning and milling\n- Grinding and tool sharpening',
    toc: [
      'Workshop safety',
      'Measuring and marking out',
      'Bench work and fitting',
      'Drilling',
      'The centre lathe',
      'Milling',
      'Grinding',
    ],
    ebook: [9000, 1499, 1199, 1399],
    print: [16000, 2499, 1999, 2299],
    stock: 50,
    tags: ['workshop', 'lathe', 'milling', 'fitting'],
  },
  {
    title: 'Machine Tools Practice',
    subtitle: 'Lathes, milling machines, shapers and grinders',
    edition: '2nd edition',
    categories: ['Manufacturing and Workshop Technology'],
    pages: 242,
    abstract:
      'An in-depth guide to the machine tools of the engineering workshop: how each machine works, how it is set up, the cutting tools it uses and the operations it performs. Cutting speeds, feeds and machining times are worked out for every machine.',
    description:
      '- The centre lathe and its operations\n- Milling machines and indexing\n- Shaping and planing\n- Grinding machines\n- Cutting tools, speeds and feeds',
    toc: [
      'Metal cutting',
      'The centre lathe',
      'Turning operations',
      'Milling machines',
      'Shaping and planing',
      'Grinding machines',
      'Cutting tools and tool life',
    ],
    ebook: [9000, 1499, 1199, 1399],
    print: [16000, 2499, 1999, 2299],
    stock: 30,
    tags: ['machine tools', 'lathe', 'milling', 'cutting speeds'],
  },
  {
    title: 'Essentials of Technical Drawing',
    subtitle: 'Projections, sections and working drawings',
    edition: '2nd edition',
    categories: ['Technical Drawing'],
    pages: 220,
    abstract:
      'The essentials of technical drawing for engineering students: instruments and lettering, geometrical construction, orthographic and isometric projection, sectional views, dimensioning and working drawings, following current standards.',
    description:
      '- Drawing instruments and lettering\n- Geometrical construction\n- Orthographic and isometric projection\n- Sections and conventions\n- Dimensioning and working drawings',
    toc: [
      'Instruments and lettering',
      'Geometrical construction',
      'Orthographic projection',
      'Isometric projection',
      'Sectional views',
      'Dimensioning',
      'Working drawings',
    ],
    ebook: [8000, 1299, 999, 1199],
    print: [14000, 2199, 1799, 1999],
    stock: 40,
    tags: ['technical drawing', 'projection', 'engineering drawing'],
  },
  {
    title: 'ABC of Technical Drawing',
    subtitle: 'A first course for beginners',
    edition: '1st edition',
    categories: ['Technical Drawing'],
    pages: 148,
    abstract:
      'A gentle first course in technical drawing for beginners in secondary schools, technical colleges and the first year of university: lines, lettering, shapes, simple projections and freehand sketching, one step at a time.',
    description:
      '- Lines and lettering\n- Basic shapes and constructions\n- Simple projections\n- Freehand sketching\n- Reading a drawing',
    toc: [
      'Lines and lettering',
      'Basic shapes',
      'Simple constructions',
      'Simple projections',
      'Freehand sketching',
      'Reading a drawing',
    ],
    ebook: [6000, 999, 799, 899],
    print: [10000, 1699, 1399, 1499],
    stock: 60,
    tags: ['technical drawing', 'beginners', 'sketching'],
  },
  {
    title: 'Technology of Properties of Materials',
    subtitle: 'Why materials behave as they do',
    edition: '1st edition',
    categories: ['Engineering Materials'],
    pages: 274,
    abstract:
      'The mechanical, physical and chemical properties of engineering materials, how they are measured and how they are controlled: metals and alloys, polymers, ceramics and composites, with the tests used in industry and the laboratory.',
    description:
      '- Atomic structure and bonding\n- Mechanical properties and testing\n- Ferrous and non-ferrous alloys\n- Polymers, ceramics and composites\n- Corrosion and its prevention',
    toc: [
      'Structure of materials',
      'Mechanical properties',
      'Materials testing',
      'Ferrous metals',
      'Non-ferrous metals',
      'Polymers and ceramics',
      'Composites',
      'Corrosion',
    ],
    ebook: [10000, 1699, 1399, 1599],
    print: [18000, 2899, 2399, 2599],
    stock: 25,
    tags: ['materials', 'properties', 'testing', 'corrosion'],
  },
];

export interface ArrangedPaper {
  title: string;
  /** Names; the first is the lecturer (the demo author). */
  coAuthors?: string[];
  area: string;
  eventType: 'conference' | 'workshop' | 'seminar' | 'journal';
  venue: string;
  location: string;
  publisher: string;
  pages: string;
  date: string;
  /** `external`: listed for citation only, read at the publisher. */
  access: 'sale' | 'external';
  externalUrl?: string;
  length: number;
  abstract: string;
  keywords: string[];
  body: string[];
}

/** Demo papers in each of the lecturer's areas (two cited at a publisher, the rest for sale). */
export const ARRANGED_PAPERS: ArrangedPaper[] = [
  {
    title:
      'Suitability of Local Clay Deposits as Binders for Green Sand Moulding',
    area: 'Foundry Technology',
    eventType: 'conference',
    venue: 'Annual Conference of the Nigerian Metallurgical Society',
    location: 'Jos, Nigeria',
    publisher: 'Nigerian Metallurgical Society',
    pages: '45–56',
    date: '2018-11-14',
    access: 'sale',
    length: 12,
    abstract:
      'Clay samples from four deposits were tested as binders for green sand moulding. Green compression strength, permeability and shatter index were measured at 4–10% clay and 3–6% moisture. Two of the local clays matched imported bentonite at 8% clay, showing that local binders can lower the cost of foundry sand in Nigeria.',
    keywords: ['green sand', 'local clay', 'binder', 'foundry'],
    body: [
      'Moulding sand must combine strength, permeability, refractoriness and collapsibility. In most Nigerian foundries the bond comes from imported bentonite, which raises costs and depends on foreign exchange.',
      'Samples were dried, crushed and sieved, then mixed with silica sand at different clay and moisture contents. Standard AFS test specimens were rammed three times and tested for green compression strength and permeability.',
      'At 8% clay and 4% moisture, the best local samples reached green compression strengths within 10% of bentonite-bonded sand, with comparable permeability. Castings poured in these moulds were free of sand inclusions.',
    ],
  },
  {
    title: 'Reducing Casting Defects in Small-Scale Nigerian Foundries',
    coAuthors: ['Dr. B. Okonkwo'],
    area: 'Foundry Technology',
    eventType: 'workshop',
    venue: 'National Workshop on Foundry Practice and Small-Scale Industry',
    location: 'Enugu, Nigeria',
    publisher: 'Raw Materials Research and Development Council',
    pages: '12–21',
    date: '2021-06-09',
    access: 'sale',
    length: 10,
    abstract:
      'A survey of 18 small-scale foundries found that gas porosity, shrinkage and sand inclusions account for most rejected castings. Simple changes to gating, sand control and melt handling, tried in three of the foundries, reduced rejects from about 22% to under 8% within six months.',
    keywords: ['casting defects', 'small-scale foundries', 'gating', 'quality'],
    body: [
      'Small-scale foundries make most of the pots, machine parts and spares cast in Nigeria, yet rejects are high and quality varies from batch to batch.',
      'Each foundry was visited three times. Rejected castings were classified by defect, and the gating, sand mixing and melting practice were observed and recorded.',
      'Most defects traced back to turbulent filling, wet sand and poorly skimmed metal. Pouring basins, regular moisture checks and slag skimming were introduced at little cost.',
    ],
  },
  {
    title:
      "The Ajaokuta Steel Plant and Nigeria's Industrialisation: Prospects and Challenges",
    area: 'Iron and Steel Making',
    eventType: 'conference',
    venue: 'Annual Conference of the Nigerian Metallurgical Society',
    location: 'Abuja, Nigeria',
    publisher: 'Nigerian Metallurgical Society',
    pages: '101–114',
    date: '2019-11-20',
    access: 'sale',
    length: 14,
    abstract:
      "This paper reviews the history of the Ajaokuta steel project, the state of its plant and the conditions needed to complete and operate it. A working integrated steel plant would supply the flat and long products that Nigeria's manufacturing and construction sectors now import.",
    keywords: ['Ajaokuta', 'steel industry', 'industrialisation', 'Nigeria'],
    body: [
      "Steel is the foundation of industrial development. Nigeria's plan for an integrated steel plant at Ajaokuta dates from the 1970s, but the plant has never produced steel at scale.",
      'The paper draws on published reports, site visits and interviews with engineers who worked on the project, comparing its design with integrated plants built elsewhere in the same period.',
      'Completing the plant needs reliable raw materials, a rail link, power and trained staff. Each is discussed, with the role of technical education in supplying the skilled workforce.',
    ],
  },
  {
    title: 'Direct Reduction of Itakpe Iron Ore Using Nigerian Coal',
    coAuthors: ['Dr. B. Okonkwo'],
    area: 'Iron and Steel Making',
    eventType: 'journal',
    venue: 'Journal of Metallurgy and Materials Engineering',
    location: '',
    publisher: 'Nigerian Society of Engineers',
    pages: '33–42',
    date: '2016-03-01',
    access: 'external',
    externalUrl: 'https://example.org/journals/jmme/direct-reduction-itakpe',
    length: 10,
    abstract:
      'Pellets of beneficiated Itakpe iron ore were reduced with sub-bituminous coal at 900–1100 °C. The degree of metallisation rose with temperature and time, reaching 87% at 1050 °C after 90 minutes, which suggests local coal can serve as a reductant for sponge iron production.',
    keywords: ['direct reduction', 'Itakpe ore', 'sponge iron', 'coal'],
    body: [],
  },
  {
    title:
      'Occupational Safety Practices in Nigerian Foundries and Metal Workshops',
    area: 'Safety',
    eventType: 'workshop',
    venue: 'National Workshop on Industrial Safety and Health',
    location: 'Lagos, Nigeria',
    publisher: 'Nigerian Institute of Safety Professionals',
    pages: '8–17',
    date: '2020-09-15',
    access: 'sale',
    length: 11,
    abstract:
      'Accident records and observations from 12 foundries and metal workshops show burns, eye injuries and crushed hands as the most frequent injuries. Most were linked to missing personal protective equipment and poor housekeeping. A short safety checklist and toolbox talks are proposed.',
    keywords: [
      'occupational safety',
      'foundry',
      'workshop',
      'protective equipment',
    ],
    body: [
      'Foundries and metal workshops handle molten metal, heavy loads and rotating machines. Without safe practice, injuries are frequent and often serious.',
      'Accident books were examined and work was observed during melting, pouring, fettling and machining. Workers were also interviewed about the training and equipment they had received.',
      'Burns and eye injuries were most common during pouring and grinding. Where goggles, aprons and boots were provided and used, injuries fell sharply.',
    ],
  },
  {
    title: 'Safety Training in Technical College Workshops',
    area: 'Safety',
    eventType: 'seminar',
    venue: 'Seminar on Technical and Vocational Education',
    location: 'Kaduna, Nigeria',
    publisher: 'National Board for Technical Education',
    pages: '',
    date: '2022-04-27',
    access: 'sale',
    length: 9,
    abstract:
      'Students learn safe habits in the workshop or not at all. A study of eight technical colleges found that safety is taught mostly in theory classes. Short practical safety sessions before each workshop practical are recommended.',
    keywords: [
      'safety training',
      'technical colleges',
      'workshop practice',
      'students',
    ],
    body: [
      'Technical colleges prepare craftsmen and technicians for industry. The habits students form in college workshops follow them into employment.',
      'Curricula, lesson notes and workshop timetables were reviewed in eight colleges, and teachers and students completed questionnaires on how safety is taught.',
      'Safety was examined in theory papers but rarely practised. Colleges that began each practical with a five-minute safety briefing recorded fewer incidents.',
    ],
  },
  {
    title:
      'The Evolution of Technical Education in Nigeria from Independence to the Present',
    area: 'History and Development of Technical Education in Nigeria',
    eventType: 'conference',
    venue: 'National Conference on Technical Education',
    location: 'Nsukka, Nigeria',
    publisher: 'Faculty of Vocational and Technical Education',
    pages: '1–15',
    date: '2017-10-11',
    access: 'sale',
    length: 13,
    abstract:
      'Traces the growth of technical education in Nigeria from the trade centres of the colonial era through the technical colleges, polytechnics and universities of technology. Key policies, including the National Policy on Education, are reviewed with their effect on enrolment and quality.',
    keywords: ['technical education', 'history', 'Nigeria', 'education policy'],
    body: [
      'At independence Nigeria had few institutions offering technical training, most of them trade centres and craft schools established under colonial rule.',
      'The paper uses policy documents, government reports and enrolment statistics to follow the growth of technical colleges, polytechnics and universities of technology after 1960.',
      'Growth in numbers has not always matched growth in quality. Equipment, staffing and links with industry remain the main challenges.',
    ],
  },
  {
    title:
      'From Trade Centres to Polytechnics: Milestones in Nigerian Technical Education',
    area: 'History and Development of Technical Education in Nigeria',
    eventType: 'journal',
    venue: 'Nigerian Journal of Technical Education',
    location: '',
    publisher: 'National Board for Technical Education',
    pages: '22–34',
    date: '2015-07-01',
    access: 'external',
    externalUrl:
      'https://example.org/journals/njte/trade-centres-to-polytechnics',
    length: 12,
    abstract:
      'A short history of the institutions that have trained Nigerian technicians and engineers, from the first trade centres to the federal and state polytechnics, and the role of the National Board for Technical Education in setting standards.',
    keywords: ['polytechnics', 'trade centres', 'NBTE', 'history'],
    body: [],
  },
  {
    title:
      "Technical Education as a Driver of Nigeria's Techno-Industrial Development",
    area: 'Technical Education and Techno-Industrial Development',
    eventType: 'conference',
    venue: 'International Conference on Engineering and Technology Education',
    location: 'Abuja, Nigeria',
    publisher: 'Nigerian Society of Engineers',
    pages: '210–222',
    date: '2023-05-17',
    access: 'sale',
    length: 12,
    abstract:
      'No nation industrialises without skilled technicians and engineers. Comparing Nigeria with countries that industrialised recently, this paper argues that well-equipped technical education linked to industry is a precondition for techno-industrial development, and proposes practical steps.',
    keywords: [
      'technical education',
      'industrial development',
      'skills',
      'Nigeria',
    ],
    body: [
      'Countries that industrialised in the last fifty years invested heavily in technical and vocational education before and during their growth.',
      'The paper compares enrolment, funding and industry links in technical education in Nigeria with those of selected industrialised countries.',
      'Recommendations include industrial attachments for students, modern workshop equipment and partnerships between institutions and local manufacturers.',
    ],
  },
  {
    title:
      'Bridging the Skills Gap: Technical Education and Local Manufacturing',
    coAuthors: ['Dr. B. Okonkwo'],
    area: 'Technical Education and Techno-Industrial Development',
    eventType: 'workshop',
    venue: 'Workshop on Skills Development for Local Manufacturing',
    location: 'Owerri, Nigeria',
    publisher: 'Manufacturers Association of Nigeria',
    pages: '5–14',
    date: '2024-08-21',
    access: 'sale',
    length: 10,
    abstract:
      'Local manufacturers report difficulty finding technicians with practical skills. Interviews with 25 firms and 10 institutions identify the gaps and suggest how curricula, staff training and industrial placements can close them.',
    keywords: [
      'skills gap',
      'local manufacturing',
      'technical education',
      'industry',
    ],
    body: [
      'Nigerian manufacturers often retrain new technicians for months before they can work unsupervised, which adds cost and slows production.',
      'Managers of 25 manufacturing firms and heads of department in 10 technical institutions were interviewed about the skills graduates bring and the skills firms need.',
      'The largest gaps were in machine operation, maintenance and reading engineering drawings. Joint curriculum reviews and longer placements are proposed.',
    ],
  },
];
