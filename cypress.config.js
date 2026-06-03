// cypress.config.js
import { defineConfig } from 'cypress';
import dotenv from 'dotenv'; // Importação do dotenv
import fs from 'fs';
const path = require('path');

// Chame dotenv.config() para carregar as variáveis do .env
dotenv.config();

// Importações para @badeball/cypress-cucumber-preprocessor
import createBundler from "@bahmutov/cypress-esbuild-preprocessor";
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor";
import { createEsbuildPlugin } from "@badeball/cypress-cucumber-preprocessor/esbuild";

export default defineConfig({
  e2e: {
    specPattern: "**/*.feature", // Define que os arquivos de feature serão os specs
    async setupNodeEvents(on, config) {
      // Configuração do @badeball/cypress-cucumber-preprocessor
      await addCucumberPreprocessorPlugin(on, config);

      on(
        "file:preprocessor",
        createBundler({
          plugins: [
            createEsbuildPlugin(config, {
              loader: { '.js': 'js' },
            }),
          ],
        })
      );
      on('task', {
        lerJsonSeExistir(args) {
          const { caminhoArquivo } = args || {};
          if (!caminhoArquivo) return null;

          const caminhoCompleto = path.isAbsolute(caminhoArquivo)
            ? caminhoArquivo
            : path.join(process.cwd(), caminhoArquivo);

          if (!fs.existsSync(caminhoCompleto)) return null;

          const conteudoBruto = fs.readFileSync(caminhoCompleto, 'utf8');
          if (!conteudoBruto || !conteudoBruto.trim()) return [];
          return JSON.parse(conteudoBruto);
        },
        escreverJson({ caminhoArquivo, conteudo }) {
          const caminhoCompleto = path.join(process.cwd(), caminhoArquivo);
          fs.writeFileSync(caminhoCompleto, JSON.stringify(conteudo, null, 2), 'utf8');
          return null;
        },
        listarArquivos(caminho) {
          const diretorioCompleto = path.resolve(caminho);

          if (!fs.existsSync(diretorioCompleto)) {
            throw new Error(`Diretório não encontrado: ${diretorioCompleto}`);
          }

          const arquivos = fs.readdirSync(diretorioCompleto);
          return arquivos;
        },
      });

      config.env = {
        ...config.env,
        ...process.env,
      }
      return config;
    },
  pageLoadTimeout: 20000,  
  defaultCommandTimeout: 20000,  
  },
});