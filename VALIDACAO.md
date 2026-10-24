# Validacao e limites

Testes realizados no Ubuntu 24.04 x86-64 com X11 virtual, Electron 43.8.3 e a biblioteca SQLite ABI 148. Os testes em Xvfb confirmam o comportamento do codigo; nao simulam desempenho real em jogos, NVIDIA, som fisico ou varios monitores Cinnamon.

## Verificacoes

- A janela principal, bandeja, gravacao CPU, salvamento de replay e registro na biblioteca passaram em testes locais anteriores.
- Atalhos e teclas do numpad foram testados com eventos X11 reais; a tecla continuou chegando ao campo de texto focado.
- A deteccao foi testada com janelas de teste que simulam identidades Sober e desconhecidas, caminhos Steam/Proton e Flatpak. Isso nao substitui um teste real de Roblox/Sober.
- A notificacao e o comando de audio foram verificados com substitutos de teste. Ainda precisam de validacao no painel Cinnamon e nos alto-falantes reais.
- O titulo de novos clipes fica vazio. Os nomes internos dos arquivos continuam unicos para evitar sobrescrita.
- NVENC foi configurado para priorizar baixa latencia, mas nao havia GPU NVIDIA disponivel para medir o resultado. A melhora de desempenho em Sober nao esta comprovada.
- Quando NVENC falha em modo GPU/automatico, a alternativa CPU limita a captura a 720p/30 FPS. Isso reduz carga, mas pode nao resolver travamentos em todos os computadores.

## Sistemas

O vinculo SQLite requer glibc 2.38+ e libstdc++ 13+. Linux Mint 22 e Ubuntu 24.04 x86-64 com X11 atendem a versao minima; Mint 21, Ubuntu 22.04 e Debian 12 nao atendem. Wayland, ARM e 32 bits nao sao suportados. Outras distribuicoes compativeis em ABI ainda nao foram testadas na pratica.

A captura e feita de uma janela X11 visivel. Conteudo encoberto ou minimizado pode nao ser capturado. Recursos avancados do Medal para Windows continuam ausentes.
