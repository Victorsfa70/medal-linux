# Validação e limites

Testes realizados no Ubuntu 24.04 x86-64 com X11 virtual, Electron 43.8.3 e a biblioteca SQLite ABI 148. Os testes em Xvfb confirmam o comportamento do código; não simulam desempenho real em jogos, NVIDIA, som físico ou vários monitores Cinnamon.

## Verificações

- A janela principal, bandeja, gravação CPU, salvamento de replay e registro na biblioteca passaram em testes locais anteriores.
- Atalhos e teclas do numpad foram testados com eventos X11 reais; a tecla continuou chegando ao campo de texto focado.
- A detecção foi testada com janelas de teste que simulam identidades Sober e desconhecidas, caminhos Steam/Proton e Flatpak. Isso não substitui um teste real de Roblox/Sober.
- A notificação e o comando de áudio foram verificados com substitutos de teste. Ainda precisam de validação no painel Cinnamon e nos alto-falantes reais.
- O título de novos clipes fica vazio. Os nomes internos dos arquivos continuam únicos para evitar sobrescrita.
- NVENC foi configurado para priorizar baixa latência, mas não havia GPU NVIDIA disponível para medir o resultado. A melhora de desempenho em Sober não está comprovada.
- Quando NVENC falha em modo GPU/automático, a alternativa CPU limita a captura a 720p/30 FPS. Isso reduz carga, mas pode não resolver travamentos em todos os computadores.

## Sistemas

O vínculo SQLite requer glibc 2.38+ e libstdc++ 13+. Linux Mint 22 e Ubuntu 24.04 x86-64 com X11 atendem à versão mínima; Mint 21, Ubuntu 22.04 e Debian 12 não atendem. Wayland, ARM e 32 bits não são suportados. Outras distribuições compatíveis em ABI ainda não foram testadas na prática.

A captura é feita de uma janela X11 visível. Conteúdo encoberto ou minimizado pode não ser capturado. Recursos avançados do Medal para Windows continuam ausentes.
