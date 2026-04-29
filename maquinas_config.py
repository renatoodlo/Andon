# Mapeamento InventoryNumber → Nome da Máquina
# Edite à vontade: { 'numero': 'nome_exibido' }
MAQUINAS = {
    # CM09
    '6518':  'RA06 CM09',
    '6523':  'OP20 CM09',
    '6800':  'OP30 AB CM09',
    '6810':  'LIBERAÇÃO DE LINHA CM09',
    '7377':  'OP10 CM09',
    '8863':  'OP30 CD CM09',
    # CM10
    '3803':  'OP40 CM10',
    '6520':  'RA09 CM10',
    '7345':  'OP10 CM10',
    '7494':  'OP30 CM10',
    # CM03
    '6521':  'OP20 CM03',
    '7378':  'OP10 CM03',
    '7681':  'RA11 CM03',
    '8846':  'OP30 AB CM03',
    '8858':  'OP30 CD CM03',
    # CM04
    '6519':  'OP20 CM04',
    '7375':  'OP10 CM04',
    '7680':  'RA15 CM04',
    '8791':  'OP30 AB CM04',
    '10302': 'OP30 CD CM04',
}


def nome_maquina(inventory_number: str) -> str:
    return MAQUINAS.get(str(inventory_number), f'Máquina {inventory_number}')
