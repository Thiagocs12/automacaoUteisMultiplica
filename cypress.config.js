import { defineConfig } from 'cypress'
import dotenv from 'dotenv'
import fs from 'fs'
const path = require('path')
const { dbTasks } = require('./cypress/support/tasks/dbTasks')
const { closeAllPools } = require('./cypress/support/db/dbClient')

import createBundler from "@bahmutov/cypress-esbuild-preprocessor"
import { addCucumberPreprocessorPlugin } from "@badeball/cypress-cucumber-preprocessor"
import { createEsbuildPlugin } from "@badeball/cypress-cucumber-preprocessor/esbuild"

dotenv.config()

export default defineConfig({
  e2e: {
    specPattern: "**/*.feature",
    async setupNodeEvents(on, config) {
      await addCucumberPreprocessorPlugin(on, config)

      on(
        "file:preprocessor",
        createBundler({
          plugins: [createEsbuildPlugin(config)],
        })
      )

      on('task', {
        // ─── File tasks ───────────────────────────────────────
        lerJsonSeExistir(args) {
          const { caminhoArquivo } = args || {}
          if (!caminhoArquivo) return null

          const caminhoCompleto = path.isAbsolute(caminhoArquivo)
            ? caminhoArquivo
            : path.join(process.cwd(), caminhoArquivo)

          if (!fs.existsSync(caminhoCompleto)) return null

          const conteudoBruto = fs.readFileSync(caminhoCompleto, 'utf8')
          if (!conteudoBruto || !conteudoBruto.trim()) return []

          try {
            return JSON.parse(conteudoBruto)
          } catch (e) {
            console.error(`[lerJsonSeExistir] Falha ao parsear: ${caminhoCompleto}`)
            console.error(`[lerJsonSeExistir] Erro: ${e.message}`)
            return null
          }
        },
        escreverJson({ caminhoArquivo, conteudo }) {
          const caminhoCompleto = path.join(process.cwd(), caminhoArquivo)
          fs.writeFileSync(caminhoCompleto, JSON.stringify(conteudo, null, 2), 'utf8')
          return null
        },
        listarArquivos(caminho) {
          const diretorioCompleto = path.resolve(caminho)
          if (!fs.existsSync(diretorioCompleto)) {
            throw new Error(`Diretório não encontrado: ${diretorioCompleto}`)
          }
          return fs.readdirSync(diretorioCompleto)
        },

        // ─── DB tasks ─────────────────────────────────────────
        ...dbTasks,
      })

      on('after:run', async () => {
        await closeAllPools()
      })

      config.env = {
        ...config.env,
        ...process.env,
      }

      return config
    },
    pageLoadTimeout: 20000,
    defaultCommandTimeout: 20000,
  },
})