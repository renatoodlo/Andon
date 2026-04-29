# Mapeamento InventoryNumber → Nome da Máquina
# Edite à vontade: { 'numero': 'nome_exibido' }
MAQUINAS = {
    '0001': 'CM01 - OP01',
    '0002': 'CM02 - OP02',
    '0003': 'CM03 - OP03',
    '0004': 'CM04 - OP04',
    '0005': 'CM05 - OP05',
    # Adicione mais linhas aqui seguindo o mesmo padrão
}


def nome_maquina(inventory_number: str) -> str:
    return MAQUINAS.get(str(inventory_number), f'Máquina {inventory_number}')
