# Adaptacao do Medal para Linux

Projeto comunitario e experimental para Linux x86-64 com X11. Nao e oficial, afiliado ou mantido pelo Medal.tv.

**Downloads beta:** [pagina de lancamentos](https://github.com/Victorsfa70/medal-linux/releases)

## Compatibilidade

Testado pelo mantenedor no Linux Mint 22 Cinnamon/X11. Requer Linux x86-64, glibc 2.38 ou mais recente, libstdc++ 13 ou mais recente, Python 3.11 ou mais recente, X11 e FFmpeg. Wayland, ARM e distribuicoes mais antigas nao sao suportados. Outras distribuicoes e placas de video ainda precisam de testes reais.

## Recursos e limites

Inclui a interface original do Medal, bandeja do sistema, gravacao de replay, atalhos configuraveis com suporte a numpad, notificacoes do Linux e selecao manual de janelas de jogos. Ha deteccao automatica para alguns jogos, incluindo Sober/Roblox, Minecraft e jogos Steam/Proton conhecidos.

A captura exige que a janela do jogo permaneca visivel no X11. Desempenho, deteccao e compatibilidade variam por jogo e equipamento. Alguns recursos exclusivos do Medal para Windows ainda nao foram adaptados.

## Instalacao

O instalador baixa componentes oficiais durante a configuracao e verifica seus hashes. Para compilar o pacote e consultar os testes, veja [VALIDACAO.md](VALIDACAO.md). Os nomes e a funcao de cada arquivo estao em [ARQUIVOS.md](ARQUIVOS.md). Avisos de terceiros: [AVISOS.md](AVISOS.md).

## Privacidade

Conta, configuracoes, atalhos e gravacoes ficam no perfil local e nao sao incluidos neste repositorio. Nao envie seu perfil ou logs sem revisar o conteudo.
