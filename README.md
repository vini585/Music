# Orbita

Player de músicas e vídeos para Android, feito com HTML/JS e empacotado com [Capacitor](https://capacitorjs.com).

## O que tem

- Toca MP3, M4A, WAV, OGG, FLAC e vídeos MP4/WebM, com visualizador de áudio em tempo real
- Biblioteca salva no aparelho, busca e filtros (todas, favoritas, vídeos)
- Favoritas e playlists (criar, renomear, apagar, tocar tudo, aleatório)
- Estatísticas: tempo total ouvindo, gráfico por dia (7 ou 30 dias), faixas e artistas mais ouvidos
- Aba **Baixar**: busca de músicas no Internet Archive (acervo livre) e download por link direto de arquivo
- Importar arquivos do celular
- Tema escuro e claro

## Gerar o APK pelo GitHub (sem instalar nada)

1. Crie um repositório no GitHub e envie esta pasta inteira.
2. Abra a aba **Actions** do repositório. O workflow **Gerar APK** roda sozinho a cada push (ou clique em *Run workflow*).
3. Quando terminar (uns 5 a 10 minutos), abra a execução e baixe o artefato **orbita-apk**. Dentro dele está o `app-debug.apk`.
4. Passe o APK para o celular e instale (o Android pede para permitir instalar de fontes desconhecidas).

O APK gerado é de teste (debug). Para publicar na Play Store é preciso um build assinado (release).

## Gerar o APK no seu computador

Precisa de Node 20+, Java 17 e Android Studio.

```bash
npm install
npx cap add android
npx cap sync android
npx cap open android      # abre no Android Studio; use Build > Build APK(s)
```

## Testar no navegador

```bash
npx serve www
```

No navegador os arquivos ficam no IndexedDB. No Android eles ficam no armazenamento do app. A busca do Internet Archive e o download por link também funcionam no navegador, mas alguns links são bloqueados por CORS. No app Android isso não acontece.

## Estrutura

```
www/index.html      telas e ícones
www/styles.css      tema (tokens no topo)
www/js/app.js       telas: biblioteca, baixar, playlists, estatísticas, player
www/js/player.js    reprodução, fila, aleatório, repetir, visualizador
www/js/storage.js   IndexedDB e arquivos no Android
www/js/download.js  download por link e busca no Internet Archive
www/js/stats.js     tempo de escuta, mais ouvidas, artistas
```

## Limitações conhecidas

- **Tocar com a tela apagada ou em segundo plano:** o Android pode pausar o áudio de um app web. Para resolver, adicione um plugin de serviço em primeiro plano / controles de mídia (por exemplo, um plugin de notificação de mídia para Capacitor).
- **YouTube, Spotify e Instagram:** não estão incluídos.
- Baixe e guarde apenas conteúdo que você tem direito de usar.
