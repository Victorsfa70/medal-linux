# Adaptação do Medal para Linux

Projeto comunitário e experimental para Linux x86-64 com X11. Não é oficial, afiliado ou mantido pelo Medal.tv.

**Downloads beta:** [página de lançamentos](https://github.com/Victorsfa70/medal-linux/releases)

## Compatibilidade

Testado pelo mantenedor no Linux Mint 22 Cinnamon/X11. Requer Linux x86-64, glibc 2.38 ou mais recente, libstdc++ 13 ou mais recente, Python 3.11 ou mais recente, X11 e FFmpeg. Wayland, ARM e distribuições mais antigas não são suportados. Outras distribuições e placas de vídeo ainda precisam de testes reais.

## Recursos e limites

Inclui a interface original do Medal, bandeja do sistema, gravação de replay, atalhos configuráveis com suporte a numpad, notificações do Linux e seleção manual de janelas de jogos. Há detecção automática para alguns jogos, incluindo Sober/Roblox, Minecraft e jogos Steam/Proton conhecidos.

A captura exige que a janela do jogo permaneça visível no X11. Desempenho, detecção e compatibilidade variam por jogo e equipamento. Alguns recursos exclusivos do Medal para Windows ainda não foram adaptados.

## Instalação

O instalador baixa componentes oficiais durante a configuração e verifica seus hashes. Para compilar o pacote e consultar os testes, veja [VALIDACAO.md](VALIDACAO.md). Os nomes e a função de cada arquivo estão em [ARQUIVOS.md](ARQUIVOS.md). Avisos de terceiros: [AVISOS.md](AVISOS.md).

## Privacidade

Conta, configurações, atalhos e gravações ficam no perfil local e não são incluídos neste repositório. Não envie seu perfil ou logs sem revisar o conteúdo.
