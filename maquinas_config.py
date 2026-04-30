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
    # CM11 — Pass Car
    '7781':  'OP10AB CM11',
    '7782':  'OP10CD CM11',
    '7783':  'OP10 CM11',
    '7784':  'OP30 CM11',
    '7785':  'RA14 CM11',
    '7786':  'RA13 CM11',
    '7787':  'OP70 CM11',
    # CM13 — Pass Car
    '7476':  'OP10AB CM13',
    '7376':  'OP10CD CM13',
    '7576':  'OP20 CM13',
    '7676':  'OP30 CM13',
    '7276':  'OP40A CM13',
    '7776':  'OP40B CM13',
    '7876':  'OP50 CM13',
    '7978':  'OP70 CM13',
    # CM15 — Pass Car
    '6400':  'OP10AB CM15',
    '6401':  'OP10CD CM15',
    '5420':  'OP20 CM15',
    '6403':  'OP30 CM15',
    '6408':  'OP40A CM15',
    '6405':  'OP40B CM15',
    '6406':  'OP50 CM15',
    '7975':  'OP70 CM15',
}


def nome_maquina(inventory_number: str, conn=None) -> str:
    """Retorna nome da máquina. Consulta banco se conn fornecido, senão usa dict local."""
    if conn is not None:
        row = conn.execute(
            "SELECT nome FROM maquinas WHERE inventory_number = ?", (str(inventory_number),)
        ).fetchone()
        if row:
            return row[0]
    return MAQUINAS.get(str(inventory_number), f'Máquina {inventory_number}')
