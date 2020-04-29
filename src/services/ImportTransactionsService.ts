import csvParse from 'csv-parse';
import fs from 'fs';
import { getCustomRepository, getRepository, In } from 'typeorm';
import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';

interface CSVtransation {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(pathFile: string): Promise<Transaction[]> {
    const categoriesRopository = getRepository(Category);
    const transactionRepository = getCustomRepository(TransactionsRepository);
    const contactdReadStream = fs.createReadStream(pathFile);

    const parses = csvParse({
      delimiter: ',',
      from_line: 2,
    });

    const parseCSV = contactdReadStream.pipe(parses);

    const transactions: CSVtransation[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => parseCSV.on('end', resolve));

    const existsCategories = await categoriesRopository.find({
      where: {
        title: In(categories),
      },
    });

    const categoryTitles = existsCategories.map(
      (category: Category) => category.title,
    );

    const addCategoryTitles = categories
      .filter(c => !categoryTitles.includes(c))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRopository.create(
      addCategoryTitles.map(title => ({ title })),
    );

    await categoriesRopository.save(newCategories);

    const finalCategories = [...newCategories, ...existsCategories];
    const createdTransactions = transactionRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: finalCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(pathFile);

    return createdTransactions;
  }
}

export default ImportTransactionsService;
