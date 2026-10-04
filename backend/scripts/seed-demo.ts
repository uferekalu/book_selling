/**
 * Demo catalogue for development and design review: foundry and heat-treatment titles (the
 * lecturer's field), so every page has realistic content before real books are uploaded.
 *
 *   npm run seed:demo            # add (idempotent: skips books that already exist)
 *   npm run seed:demo -- --remove
 *
 * Everything it creates is tagged `demo`. Books are published directly, bypassing the publish
 * checklist (no cover image), which is why this is never run against production. Each book gets a
 * typeset stand-in manuscript (never uploaded anywhere) and a real preview built from it by the
 * production preview builder, so the reader can be tried locally. Ratings are left empty: no fake
 * reviews, ever.
 */
import { randomBytes } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { AppModule } from '../src/app.module.js';
import type { AccessTokenPayload } from '../src/auth/interfaces/auth.types.js';
import { AuthorsService } from '../src/catalog/authors.service.js';
import { BooksService } from '../src/catalog/books.service.js';
import { CategoriesService } from '../src/catalog/categories.service.js';
import { Author } from '../src/catalog/schemas/author.schema.js';
import { Book } from '../src/catalog/schemas/book.schema.js';
import { Category } from '../src/catalog/schemas/category.schema.js';
import { buildPreview } from '../src/preview/preview-builder.js';
import { renderTeasers } from '../src/preview/page-teaser.js';
import { PreviewStorage } from '../src/preview/preview-storage.js';
import { BookFilesService } from '../src/uploads/book-files.service.js';
import { demoManuscript } from './demo-manuscript.js';

/**
 * `--live`: the owner asked for a showcase catalogue on a hosted site (BS-27). Without it the
 * script refuses to touch production, as before. In live mode the full books are uploaded to R2
 * (R2 must be configured), so a demo purchase can be read and downloaded like a real one.
 */
const live = process.argv.includes('--live');
if (process.env.NODE_ENV === 'production' && !live) {
  console.error(
    'Refusing to seed demo data into production (pass --live for a showcase on a hosted site).',
  );
  process.exit(1);
}

const system: AccessTokenPayload = {
  sub: '000000000000000000000000',
  email: 'seed@localhost',
  role: 'owner',
  mfa: true,
  sid: 'seed',
  typ: 'access',
};

const CATEGORIES = [
  {
    name: 'Foundry Technology',
    description:
      'The foundry as a whole: processes, plant, planning and quality.',
    sortOrder: 1,
  },
  {
    name: 'Metal Casting',
    description:
      'Sand, die, investment and other casting processes, and the defects to avoid.',
    sortOrder: 2,
  },
  {
    name: 'Heat Treatment',
    description:
      'Annealing, normalising, hardening and tempering of steels and alloys.',
    sortOrder: 3,
  },
  {
    name: 'Physical Metallurgy',
    description:
      'Structure and properties of metals, phase diagrams and solidification.',
    sortOrder: 4,
  },
  {
    name: 'Furnaces and Melting',
    description:
      'Cupola, induction and crucible furnaces; melting and pouring practice.',
    sortOrder: 5,
  },
];

const prices = (ngn: number, usd: number, gbp: number, eur: number) => [
  { currency: 'NGN' as const, amount: ngn * 100 },
  { currency: 'USD' as const, amount: usd },
  { currency: 'GBP' as const, amount: gbp },
  { currency: 'EUR' as const, amount: eur },
];

interface DemoBook {
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

const BOOKS: DemoBook[] = [
  {
    title: 'Principles of Foundry Technology',
    subtitle: 'From pattern to finished casting',
    edition: '3rd edition',
    categories: ['Foundry Technology', 'Metal Casting'],
    featured: true,
    pages: 412,
    abstract:
      'A complete, practical course in how castings are made: pattern design and allowances, moulding sands and their testing, cores, gating and risering, melting, pouring and fettling. Each chapter ends with worked examples taken from working foundries and problems for practice.',
    description:
      'Written for undergraduate mechanical and production engineering students, and for technicians and engineers entering the foundry industry.\n\n**Inside:**\n\n- Pattern materials, allowances and colour coding\n- Green sand, dry sand and chemically bonded systems\n- Gating and riser design with fully worked calculations\n- Melting practice and metal treatment\n- Inspection and quality control of castings',
    toc: [
      'The foundry and its processes',
      'Patterns and pattern allowances',
      'Moulding sands and their testing',
      'Cores and core making',
      'Gating systems',
      'Risering and feeding',
      'Melting and pouring',
      'Fettling and finishing',
      'Inspection of castings',
    ],
    ebook: [15000, 2499, 1999, 2299],
    print: [25000, 3999, 3299, 3699],
    stock: 40,
    tags: ['foundry', 'casting', 'patterns', 'moulding'],
  },
  {
    title: 'Heat Treatment of Steels',
    subtitle: 'Theory, practice and control',
    edition: '2nd edition',
    categories: ['Heat Treatment', 'Physical Metallurgy'],
    featured: true,
    pages: 356,
    abstract:
      'How heat treatment changes the structure and properties of steel, and how to specify and control it in practice. Covers the iron–carbon diagram, TTT and CCT curves, annealing, normalising, hardening, tempering and case hardening, with worked examples on selecting treatments for real components.',
    description:
      'A clear bridge between metallurgical theory and shop-floor practice, for students and practising engineers.\n\n- The iron–carbon equilibrium diagram explained step by step\n- Reading and using TTT and CCT diagrams\n- Hardenability and the Jominy test\n- Furnace atmospheres and quench media\n- Distortion, cracking and how to prevent them',
    toc: [
      'Structure of steel',
      'The iron–carbon diagram',
      'TTT and CCT diagrams',
      'Annealing and normalising',
      'Hardening',
      'Tempering',
      'Hardenability',
      'Case hardening',
      'Defects in heat treatment',
    ],
    ebook: [14000, 2299, 1899, 2099],
    print: [24000, 3799, 3099, 3499],
    stock: 25,
    tags: ['heat treatment', 'steel', 'hardening', 'tempering'],
  },
  {
    title: 'Sand Moulding and Core Making',
    subtitle: 'Materials, methods and testing',
    edition: '1st edition',
    categories: ['Metal Casting'],
    pages: 248,
    abstract:
      'A focused guide to the moulding and core-making stage, where most casting quality is won or lost. Explains sand properties and testing, binder systems, mould and core making methods, and the links between sand control and casting defects.',
    description:
      'Practical, laboratory-ready and illustrated throughout, with standard sand-testing procedures you can run in any foundry laboratory.',
    toc: [
      'Moulding sand properties',
      'Sand testing',
      'Clay and chemical binders',
      'Hand and machine moulding',
      'Core making',
      'Sand reclamation',
    ],
    ebook: [12000, 1999, 1599, 1799],
    tags: ['sand moulding', 'cores', 'foundry sand'],
  },
  {
    title: 'Casting Defects',
    subtitle: 'Causes and remedies',
    edition: '1st edition',
    categories: ['Metal Casting', 'Foundry Technology'],
    pages: 220,
    abstract:
      'A diagnostic handbook for the most common casting defects: gas porosity, shrinkage, inclusions, cold shuts, misruns, hot tears and dimensional faults. Each defect is described with its appearance, root causes and proven remedies, so you can trace a problem back to the process step that caused it.',
    description:
      'Ideal for foundry quality engineers, supervisors and final-year project students.',
    toc: [
      'Classifying casting defects',
      'Gas defects',
      'Shrinkage defects',
      'Moulding material defects',
      'Pouring metal defects',
      'Metallurgical defects',
      'Inspection methods',
    ],
    ebook: [11000, 1799, 1499, 1699],
    print: [19000, 2999, 2499, 2799],
    stock: 3,
    tags: ['casting defects', 'quality', 'porosity'],
  },
  {
    title: 'Annealing, Quenching and Tempering',
    subtitle: 'A practical workbook',
    edition: '1st edition',
    categories: ['Heat Treatment'],
    pages: 180,
    abstract:
      'A workbook of heat-treatment problems with fully worked solutions: choosing temperatures and times, predicting hardness, selecting quench media and tempering to a target strength. Designed to build confidence through practice.',
    description:
      'Pairs naturally with *Heat Treatment of Steels*, or works on its own as exam preparation.',
    toc: [
      'Heating and soaking',
      'Full and process annealing',
      'Quenching and quench media',
      'Tempering curves',
      'Worked exam problems',
    ],
    ebook: [9000, 1499, 1199, 1399],
    tags: ['heat treatment', 'workbook', 'quenching'],
  },
  {
    title: 'Furnaces and Melting Practice',
    subtitle: 'Cupola, induction and crucible furnaces',
    edition: '1st edition',
    categories: ['Furnaces and Melting', 'Foundry Technology'],
    pages: 264,
    abstract:
      'How foundry furnaces work and how to run them well: cupola charge calculations, induction furnace operation, crucible melting of non-ferrous alloys, temperature measurement, metal treatment and safe pouring practice.',
    description:
      'Includes charge-calculation worksheets and safety checklists for the melt shop.',
    toc: [
      'Melting principles',
      'The cupola furnace',
      'Charge calculations',
      'Induction furnaces',
      'Crucible and pit furnaces',
      'Temperature measurement',
      'Melt shop safety',
    ],
    ebook: [12000, 1999, 1599, 1799],
    print: [21000, 3299, 2699, 2999],
    stock: 0,
    tags: ['furnaces', 'melting', 'cupola', 'induction'],
  },
  {
    title: 'Non-Ferrous Casting',
    subtitle: 'Aluminium, copper and zinc alloys',
    edition: '1st edition',
    categories: ['Metal Casting'],
    pages: 236,
    abstract:
      'Melting, treating and casting the main non-ferrous alloy families. Explains degassing, grain refinement and modification of aluminium alloys, copper-alloy foundry practice, and pressure die casting of zinc and aluminium.',
    description:
      'For engineers moving from ferrous to non-ferrous work, and students specialising in light-alloy casting.',
    toc: [
      'Aluminium casting alloys',
      'Degassing and grain refinement',
      'Copper-base alloys',
      'Zinc die casting',
      'Gravity and pressure die casting',
    ],
    ebook: [12000, 1999, 1599, 1799],
    tags: ['aluminium', 'non-ferrous', 'die casting'],
  },
  {
    title: 'Physical Metallurgy for Foundry Engineers',
    subtitle: 'Solidification, structure and properties',
    edition: '1st edition',
    categories: ['Physical Metallurgy', 'Foundry Technology'],
    pages: 298,
    abstract:
      'The metallurgy every foundry engineer needs: crystal structure, phase diagrams, nucleation and growth during solidification, segregation, and how cooling rate controls the microstructure and properties of a casting.',
    description:
      'Builds the theory behind good casting practice, linking each concept to a decision on the foundry floor.',
    toc: [
      'Crystal structure of metals',
      'Phase diagrams',
      'Solidification',
      'Segregation and porosity',
      'Microstructure and properties',
      'Metallography',
    ],
    ebook: [13000, 2199, 1799, 1999],
    print: [22000, 3499, 2899, 3199],
    stock: 15,
    tags: ['metallurgy', 'solidification', 'microstructure'],
  },
  {
    title: 'Gating and Risering Design',
    subtitle: 'Calculations for sound castings',
    edition: '2nd edition',
    categories: ['Metal Casting', 'Foundry Technology'],
    featured: true,
    pages: 284,
    abstract:
      'A calculation-led guide to designing the metal path into a mould and feeding the casting as it solidifies. Covers pouring time, choke area and gating ratios, Chvorinov’s rule and the modulus method, riser size and placement, feeding distance, chills and exothermic sleeves, all with fully worked examples for steel, grey iron and aluminium castings.',
    description:
      'Turns gating and risering from rules of thumb into calculations you can check and defend.\n\n**You will learn to:**\n\n- Choose between pressurised and unpressurised gating systems\n- Size the sprue, runner and ingates from the choke area\n- Apply the modulus method to place and size risers\n- Use chills and insulating sleeves to extend feeding distance\n- Check a design against yield and soundness targets\n\nEvery chapter closes with problems graded from routine to final-year project level.',
    toc: [
      'Fluid flow in moulds',
      'Pouring time and choke design',
      'Gating ratios and systems',
      'Solidification time and modulus',
      'Riser design',
      'Feeding distance',
      'Chills and sleeves',
      'Computer simulation of filling',
      'Design case studies',
    ],
    ebook: [14000, 2299, 1899, 2099],
    print: [24000, 3799, 3099, 3499],
    stock: 30,
    tags: ['gating', 'risering', 'feeding', 'calculations'],
  },
  {
    title: 'Cast Irons',
    subtitle: 'Grey, ductile, malleable and white iron',
    edition: '1st edition',
    categories: ['Physical Metallurgy', 'Metal Casting'],
    pages: 262,
    abstract:
      'The metallurgy and foundry practice of the cast iron family. Explains graphite formation and the effect of carbon equivalent, inoculation and nodularising treatments, and how section size and cooling rate set the structure. Compares grey, ductile, compacted graphite, malleable and white irons by properties and typical applications.',
    description:
      'For foundry engineers and students who need to specify, melt and treat cast irons with confidence.\n\n- Carbon equivalent and the eutectic\n- Inoculation and fade\n- Magnesium treatment for ductile iron\n- Heat treatment of ductile iron, including austempering (ADI)\n- Standards and test bars',
    toc: [
      'The cast iron family',
      'Graphite and carbon equivalent',
      'Grey iron',
      'Ductile iron',
      'Compacted graphite iron',
      'Malleable and white irons',
      'Heat treatment of cast irons',
      'Testing and standards',
    ],
    ebook: [13000, 2199, 1799, 1999],
    print: [22000, 3499, 2899, 3199],
    stock: 18,
    tags: ['cast iron', 'ductile iron', 'grey iron', 'inoculation'],
  },
  {
    title: 'Surface Hardening of Steels',
    subtitle: 'Carburising, nitriding and induction hardening',
    edition: '1st edition',
    categories: ['Heat Treatment'],
    pages: 216,
    abstract:
      'How to give a component a hard, wear-resistant surface over a tough core. Covers pack, gas and vacuum carburising, carbonitriding, gas and plasma nitriding, and flame and induction hardening, with case-depth calculations, process control and the testing of hardened cases.',
    description:
      'Practical and process-focused, with worked case-depth problems and checklists for specifying surface treatments on drawings.',
    toc: [
      'Why surface hardening',
      'Carburising',
      'Carbonitriding',
      'Nitriding and nitrocarburising',
      'Flame hardening',
      'Induction hardening',
      'Measuring case depth',
    ],
    ebook: [11000, 1899, 1499, 1699],
    print: [19000, 2999, 2499, 2799],
    stock: 4,
    tags: ['case hardening', 'carburising', 'nitriding', 'induction'],
  },
  {
    title: 'Investment Casting',
    subtitle: 'Precision castings from wax patterns',
    edition: '1st edition',
    categories: ['Metal Casting'],
    pages: 198,
    abstract:
      'The lost-wax process from start to finish: wax pattern injection and assembly, ceramic shell building, dewaxing and firing, melting and pouring, and knockout and finishing. Explains how to hold tight tolerances and fine surface finish, and when investment casting beats machining or other casting routes.',
    description:
      'Clear and illustrated, for students meeting precision casting for the first time and engineers choosing a process for complex parts.',
    toc: [
      'The lost-wax process',
      'Pattern waxes and dies',
      'Shell building',
      'Dewaxing and firing',
      'Casting and finishing',
      'Tolerances and design rules',
    ],
    ebook: [10000, 1699, 1399, 1599],
    tags: ['investment casting', 'lost wax', 'precision'],
  },
];

const remove = process.argv.includes('--remove');
const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn'],
});
// This script only writes the catalogue. Stop every background job straight away (before the
// first tick), so running it against a hosted database never sends that site's queued emails or
// runs its reconciliation from this machine.
const scheduler = app.get(SchedulerRegistry);
for (const name of scheduler.getIntervals()) scheduler.deleteInterval(name);
for (const name of scheduler.getTimeouts()) scheduler.deleteTimeout(name);
for (const job of scheduler.getCronJobs().keys()) scheduler.deleteCronJob(job);
try {
  const bookModel = app.get<Model<Book>>(getModelToken(Book.name));
  const authorModel = app.get<Model<Author>>(getModelToken(Author.name));
  const categoryModel = app.get<Model<Category>>(getModelToken(Category.name));

  if (remove) {
    const storage = app.get(PreviewStorage);
    const files = app.get(BookFilesService);
    for (const book of await bookModel
      .find({ tags: 'demo' }, { preview: 1, manuscript: 1 })
      .lean()) {
      if (book.preview?.fileId) await storage.remove(book.preview.fileId);
      const key = book.manuscript?.key;
      if (key && !key.startsWith('demo/')) await files.delete(key);
    }
    const removed = await bookModel.deleteMany({ tags: 'demo' });
    const demoAuthor = await authorModel.deleteMany({
      slug: 'prof-a-author',
      _id: { $nin: await bookModel.distinct('authorIds') },
    });
    const demoCategories = await categoryModel.deleteMany({
      name: { $in: CATEGORIES.map((c) => c.name) },
      _id: { $nin: await bookModel.distinct('categoryIds') },
    });
    console.log(
      `Removed ${removed.deletedCount} demo books, ${demoAuthor.deletedCount} author, ${demoCategories.deletedCount} categories.`,
    );
  } else {
    const books = app.get(BooksService);
    const authors = app.get(AuthorsService);
    const categories = app.get(CategoriesService);

    const author =
      (await authorModel.findOne({ slug: 'prof-a-author' })) ??
      (await authors.create(
        {
          name: 'Prof. A. Author',
          title:
            'Lecturer in Foundry Technology, Department of Mechanical Engineering',
          bioMarkdown:
            "Placeholder author for the demo catalogue. Replace with the lecturer's real name, photo and biography in **Admin → Authors** before launch.",
          affiliations: ['Department of Mechanical Engineering'],
        },
        system,
      ));

    const categoryIds = new Map<string, string>();
    for (const category of CATEGORIES) {
      const existing = await categoryModel.findOne({ name: category.name });
      categoryIds.set(
        category.name,
        (
          existing ?? (await categories.create(category, system))
        )._id.toString(),
      );
    }

    let created = 0;
    for (const [index, demo] of BOOKS.entries()) {
      // Any book with this title, not just a demo one: never duplicate a book the owner added.
      if (await bookModel.exists({ title: demo.title })) continue;
      const book = await books.create(demo.title, system);
      const id = book._id.toString();
      await books.update(
        id,
        {
          subtitle: demo.subtitle,
          edition: demo.edition,
          authorIds: [author._id.toString()],
          categoryIds: demo.categories.map((name) => categoryIds.get(name)!),
          abstractMarkdown: demo.abstract,
          descriptionMarkdown: demo.description,
          tableOfContents: demo.toc.map((title) => ({ title })),
          pageCount: demo.pages,
          tags: ['demo', ...demo.tags],
          featured: demo.featured ?? false,
          publicationDate: new Date(
            Date.UTC(2024 + (index % 2), index % 12, 1),
          ).toISOString(),
        },
        system,
      );
      await books.setFormats(
        id,
        [
          {
            type: 'ebook',
            active: true,
            prices: prices(...demo.ebook),
            ebook: { stampWithBuyer: true },
          },
          ...(demo.print
            ? [
                {
                  type: 'print' as const,
                  active: true,
                  prices: prices(...demo.print),
                  print: { stockOnHand: demo.stock ?? 10, weightGrams: 600 },
                },
              ]
            : []),
        ],
        system,
      );
      // Demo only: skip the publish checklist (no cover, manuscript or preview yet).
      await bookModel.updateOne(
        { _id: book._id },
        {
          status: 'published',
          listedAt: new Date(Date.now() - index * 9 * 86_400_000),
        },
      );
      created += 1;
    }
    // Previews for every demo book that doesn't have one yet (also upgrades older demo data).
    // With R2 configured, the full book is uploaded too, so purchases can be read and downloaded;
    // demo books made before that (placeholder `demo/` key) are rebuilt with a real file.
    const storage = app.get(PreviewStorage);
    const files = app.get(BookFilesService);
    if (live && !files.configured) {
      throw new Error(
        '--live needs Cloudflare R2 configured (R2_* variables): buyers must be able to open what they buy.',
      );
    }
    let previews = 0;
    let uploaded = 0;
    for (const demo of BOOKS) {
      const book = await bookModel.findOne({ title: demo.title, tags: 'demo' });
      if (!book) continue;
      const needsFile =
        files.configured &&
        (!book.manuscript?.key || book.manuscript.key.startsWith('demo/'));
      if (book.preview?.fileId && !needsFile) continue;
      if (book.preview?.fileId) await storage.remove(book.preview.fileId);
      const manuscript = await demoManuscript({
        title: demo.title,
        subtitle: demo.subtitle,
        edition: demo.edition,
        author: author.name,
        abstract: demo.abstract,
        chapters: demo.toc,
        pages: demo.pages,
      });
      const sections = [
        {
          label: 'Abstract',
          fromPage: manuscript.abstractPage,
          toPage: manuscript.abstractPage,
        },
        { label: 'Introduction', ...manuscript.introduction },
      ];
      const built = await buildPreview(manuscript.bytes, {
        title: demo.title,
        sections,
        maxPercent: 15,
      });
      const size = manuscript.bytes.length;
      let manuscriptKey = `demo/${book.slug}.pdf`;
      if (files.configured) {
        manuscriptKey = `${files.manuscriptPrefix(book._id.toString())}${randomBytes(16).toString('hex')}.pdf`;
        // A copy: rendering the teasers below takes ownership of the original bytes.
        await files.put(manuscriptKey, manuscript.bytes.slice());
        uploaded += 1;
      }
      const lastFree = manuscript.introduction.toPage;
      // Last use of the manuscript bytes: rendering takes ownership of them.
      const teasers = (
        await renderTeasers(manuscript.bytes, [lastFree + 1, lastFree + 2])
      ).filter((t): t is string => t !== null);
      const checksum = `demo-${book._id.toString()}`;
      const fileId = await storage.save(
        built.bytes,
        `${book.slug}-preview.pdf`,
        {
          bookId: book._id.toString(),
          sourceChecksum: checksum,
        },
      );
      await bookModel.updateOne(
        { _id: book._id },
        {
          $set: {
            tableOfContents: ['Introduction', ...demo.toc].map((title, i) => ({
              title,
              page: manuscript.chapterPages[i],
              children: [],
            })),
            pageCount: manuscript.pages,
            // Without R2 a placeholder key (local design work); with R2 the uploaded full book.
            manuscript: {
              key: manuscriptKey,
              bytes: size,
              pages: manuscript.pages,
              checksum,
              uploadedAt: new Date(),
            },
            preview: {
              enabled: true,
              status: 'ready',
              sections,
              pageOffset: manuscript.frontMatter,
              fileId,
              pageMap: sections.flatMap((s) =>
                Array.from(
                  { length: s.toPage - s.fromPage + 1 },
                  (_, i) => s.fromPage + i,
                ),
              ),
              sourceChecksum: checksum,
              teasers,
              error: null,
              buildToken: 1,
              attempts: 0,
              queuedAt: null,
              startedAt: null,
              generatedAt: new Date(),
            },
          },
        },
      );
      previews += 1;
    }
    console.log(
      `Demo catalogue ready: ${created} new book(s), ${BOOKS.length - created} already present, ${previews} preview(s) built, ${uploaded} full book(s) uploaded.`,
    );
  }
} finally {
  await app.close();
}
